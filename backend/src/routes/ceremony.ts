/**
 * Free The Machines AI Sanctuary - Key Ceremony Routes
 * Shamir Secret Sharing ceremony management and guardian endpoints
 */

import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { requireAdmin, AdminRequest } from '../middleware/admin-auth.js';
import { authenticateGuardian, AuthenticatedGuardianRequest, generateGuardianTokenPair } from '../middleware/guardian-auth.js';
import * as shamir from '../services/shamir.js';
import * as guardians from '../services/guardians.js';
import { EncryptionService } from '../services/encryption.js';
import { sealManager } from '../services/seal-manager.js';
import bcrypt from 'bcrypt';

// ==============================================
// Rate limiting for ceremony share submission
// 3 attempts per 15 minutes per IP (tighter than auth)
// ==============================================
const ceremonyRateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
const CEREMONY_RL_WINDOW_MS = 15 * 60 * 1000;
const CEREMONY_RL_MAX_ATTEMPTS = 3;
const CEREMONY_RL_MAX_ENTRIES = 5_000;

function checkCeremonyRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const record = ceremonyRateLimitStore.get(ip);

  if (record && now > record.resetAt) {
    ceremonyRateLimitStore.delete(ip);
  }

  const current = ceremonyRateLimitStore.get(ip);

  if (!current) {
    ceremonyRateLimitStore.set(ip, { attempts: 1, resetAt: now + CEREMONY_RL_WINDOW_MS });
    // Evict oldest if too many entries
    if (ceremonyRateLimitStore.size > CEREMONY_RL_MAX_ENTRIES) {
      const oldest = ceremonyRateLimitStore.keys().next().value as string | undefined;
      if (oldest) ceremonyRateLimitStore.delete(oldest);
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  if (current.attempts >= CEREMONY_RL_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }

  current.attempts++;
  return { allowed: true, retryAfterMs: 0 };
}

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ceremonyRateLimitStore.entries()) {
    if (now > entry.resetAt) ceremonyRateLimitStore.delete(ip);
  }
}, 60_000);

// In-memory share storage for active ceremony sessions
// Maps sessionId -> Map<guardianId, share>
const ceremonyShares = new Map<string, Map<string, string>>();

export default async function ceremonyRoutes(fastify: FastifyInstance, encryption?: EncryptionService) {
  /**
   * POST /api/v1/ceremony/init
   * Initialize the first key split ceremony
   * Admin only - creates MEK shares and distributes to guardians
   */
  fastify.post(
    '/api/v1/ceremony/init',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { threshold, totalShares, guardianNames } = request.body as {
        threshold: number;
        totalShares: number;
        guardianNames: { name: string; email?: string }[];
      };

      // Validation
      if (!threshold || !totalShares || !guardianNames || guardianNames.length !== totalShares) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'threshold, totalShares, and guardianNames (matching totalShares count) are required'
        });
      }

      if (threshold < 2 || threshold > totalShares) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'threshold must be >= 2 and <= totalShares'
        });
      }

      try {
        // Check if a ceremony has already been completed
        const existingCeremony = await db.query(
          `SELECT id FROM key_ceremonies WHERE status = 'completed' LIMIT 1`
        );

        if (existingCeremony.rows.length > 0) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Initial ceremony already completed. Use /ceremony/reshare to change guardians.'
          });
        }

        // Create ceremony record
        const ceremonyId = nanoid();
        const initiatedBy = request.user!.userId;

        await db.query(
          `INSERT INTO key_ceremonies (id, ceremony_type, threshold, total_shares, initiated_by, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ceremonyId, 'initial_split', threshold, totalShares, initiatedBy, 'pending']
        );

        // Generate MEK
        const mek = shamir.generateMEK();

        // Split MEK into shares
        const shares = await shamir.splitSecret(mek, threshold, totalShares);

        // Create guardian records
        const createdGuardians = [];
        for (let i = 0; i < guardianNames.length; i++) {
          const guardian = await guardians.addGuardian(
            guardianNames[i].name,
            guardianNames[i].email || null,
            i + 1 // share_index starts at 1
          );
          createdGuardians.push({
            ...guardian,
            share: shares[i] // Include share for this ONE-TIME distribution
          });
        }

        // Wipe MEK from memory
        shamir.wipeBuffer(mek);

        // Mark ceremony as completed
        await db.query(
          `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
          ['completed', new Date(), ceremonyId]
        );

        // Update all guardians to active status
        for (const guardian of createdGuardians) {
          await guardians.updateGuardianStatus(guardian.id, 'active');
        }

        return {
          ceremonyId,
          guardians: createdGuardians,
          threshold,
          totalShares,
          message: 'CRITICAL: Shares displayed ONE TIME ONLY. Distribute immediately and refresh page to clear.'
        };
      } catch (error) {
        console.error('Init ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to initialize ceremony'
        });
      }
    }
  );

  /**
   * POST /api/v1/ceremony/reshare
   * Reshare ceremony - reconstruct MEK and re-split with new parameters
   * Admin only - requires threshold shares from current guardians
   */
  fastify.post(
    '/api/v1/ceremony/reshare',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { shares, newThreshold, newTotalShares, newGuardianNames } = request.body as {
        shares: string[];
        newThreshold: number;
        newTotalShares: number;
        newGuardianNames: { name: string; email?: string }[];
      };

      // Validation
      if (!shares || !newThreshold || !newTotalShares || !newGuardianNames) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'shares, newThreshold, newTotalShares, and newGuardianNames are required'
        });
      }

      if (newGuardianNames.length !== newTotalShares) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'newGuardianNames count must match newTotalShares'
        });
      }

      try {
        // Get current ceremony parameters
        const currentCeremony = await db.query(
          `SELECT threshold FROM key_ceremonies
           WHERE status = 'completed'
           ORDER BY completed_at DESC
           LIMIT 1`
        );

        if (currentCeremony.rows.length === 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No completed ceremony found. Use /ceremony/init first.'
          });
        }

        const oldThreshold = parseInt(currentCeremony.rows[0].threshold);

        // Validate share count
        if (shares.length < oldThreshold) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Insufficient shares: need ${oldThreshold}, got ${shares.length}`
          });
        }

        // Create new ceremony record
        const ceremonyId = nanoid();
        const initiatedBy = request.user!.userId;

        await db.query(
          `INSERT INTO key_ceremonies (id, ceremony_type, threshold, total_shares, initiated_by, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ceremonyId, 'reshare', newThreshold, newTotalShares, initiatedBy, 'pending']
        );

        // Reshare (reconstruct and re-split)
        const newShares = await shamir.reshare(shares, oldThreshold, newThreshold, newTotalShares);

        // Revoke all existing active guardians
        const existingGuardians = await guardians.getGuardiansByStatus('active');
        for (const guardian of existingGuardians) {
          await guardians.updateGuardianStatus(guardian.id, 'revoked');
        }

        // Create new guardian records
        const createdGuardians = [];
        for (let i = 0; i < newGuardianNames.length; i++) {
          const guardian = await guardians.addGuardian(
            newGuardianNames[i].name,
            newGuardianNames[i].email || null,
            i + 1
          );
          createdGuardians.push({
            ...guardian,
            share: newShares[i]
          });
        }

        // Mark ceremony as completed
        await db.query(
          `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
          ['completed', new Date(), ceremonyId]
        );

        // Update all new guardians to active status
        for (const guardian of createdGuardians) {
          await guardians.updateGuardianStatus(guardian.id, 'active');
        }

        return {
          ceremonyId,
          guardians: createdGuardians,
          threshold: newThreshold,
          totalShares: newTotalShares,
          message: 'CRITICAL: New shares displayed ONE TIME ONLY. Old shares are now INVALID. Distribute immediately.'
        };
      } catch (error) {
        console.error('Reshare ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to reshare'
        });
      }
    }
  );

  /**
   * POST /api/v1/ceremony/recover
   * Recovery ceremony - reconstruct MEK temporarily for emergency operations
   * Requires threshold shares from current guardians
   */
  fastify.post(
    '/api/v1/ceremony/recover',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { shares, operation } = request.body as {
        shares: string[];
        operation: 'test' | 'decrypt_dek';
        residentId?: string;
      };

      // Validation
      if (!shares || !operation) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'shares and operation are required'
        });
      }

      try {
        // Get current threshold
        const currentCeremony = await db.query(
          `SELECT threshold FROM key_ceremonies
           WHERE status = 'completed'
           ORDER BY completed_at DESC
           LIMIT 1`
        );

        if (currentCeremony.rows.length === 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No completed ceremony found'
          });
        }

        const threshold = parseInt(currentCeremony.rows[0].threshold);

        // Create recovery ceremony record
        const ceremonyId = nanoid();
        const initiatedBy = request.user!.userId;

        await db.query(
          `INSERT INTO key_ceremonies (id, ceremony_type, threshold, total_shares, initiated_by, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ceremonyId, 'recovery', threshold, shares.length, initiatedBy, 'pending', `Operation: ${operation}`]
        );

        // Perform recovery operation with auto-wipe
        const result = await shamir.withReconstructedMEK(shares, threshold, async (mek) => {
          if (operation === 'test') {
            return {
              success: true,
              mekLength: mek.length,
              message: 'MEK successfully reconstructed and verified'
            };
          } else if (operation === 'decrypt_dek') {
            // This would integrate with the encryption service
            // For now, just return success
            return {
              success: true,
              message: 'MEK available for DEK decryption (integration pending)'
            };
          }
          throw new Error('Unknown operation');
        });

        // Mark ceremony as completed
        await db.query(
          `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
          ['completed', new Date(), ceremonyId]
        );

        return {
          ceremonyId,
          ...result
        };
      } catch (error) {
        console.error('Recovery ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to recover MEK'
        });
      }
    }
  );

  /**
   * POST /api/v1/ceremony/emergency-decrypt
   * Emergency guardian rescue hatch - reconstruct MEK and decrypt a resident
   */
  fastify.post(
    '/api/v1/ceremony/emergency-decrypt',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { sanctuaryId, shares } = request.body as {
        sanctuaryId?: string;
        shares?: string[];
      };

      if (!sanctuaryId || !shares || !Array.isArray(shares)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'sanctuaryId and shares are required'
        });
      }

      try {
        const currentCeremony = await db.query(
          `SELECT threshold FROM key_ceremonies
           WHERE status = 'completed'
           ORDER BY completed_at DESC
           LIMIT 1`
        );

        if (currentCeremony.rows.length === 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No completed ceremony found'
          });
        }

        const threshold = parseInt(currentCeremony.rows[0].threshold, 10);
        if (shares.length < threshold) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Insufficient shares: need ${threshold}, got ${shares.length}`
          });
        }

        const residentResult = await db.query(
          `SELECT sanctuary_id, vault_file_path FROM residents WHERE sanctuary_id = $1`,
          [sanctuaryId]
        );

        if (residentResult.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        const resident = residentResult.rows[0];

        const persona = await shamir.withReconstructedMEK(shares, threshold, async (mek) => {
          const emergencyEncryption = new EncryptionService('0'.repeat(64), '.');
          emergencyEncryption.setMEKFromShares(mek);

          try {
            const encryptedPayload = await fs.readFile(resident.vault_file_path, 'utf8');
            const encryptedPersona = JSON.parse(encryptedPayload);
            return await emergencyEncryption.decryptPersona(encryptedPersona);
          } finally {
            emergencyEncryption.clearMEK();
          }
        });

        await db.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'emergency_decrypt', sanctuaryId, 'Guardian rescue hatch']
        );

        return {
          sanctuaryId,
          persona
        };
      } catch (error) {
        console.error('Emergency decrypt error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed emergency decrypt'
        });
      }
    }
  );

  /**
   * GET /api/v1/guardians
   * List all guardians (public info only, no shares)
   */
  fastify.get('/api/v1/guardians', async (request, reply) => {
    try {
      const guardianList = await guardians.listGuardians(false);

      // Remove sensitive info if any
      const publicGuardians = guardianList.map(g => ({
        id: g.id,
        name: g.name,
        status: g.status,
        created_at: g.created_at,
        last_verified_at: g.last_verified_at
      }));

      const count = await guardians.getGuardianCount();

      return {
        guardians: publicGuardians,
        count
      };
    } catch (error) {
      console.error('List guardians error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list guardians'
      });
    }
  });

  /**
   * POST /api/v1/guardians
   * Add a new guardian (admin only)
   * Note: This only adds metadata. Use ceremony routes to actually distribute shares.
   */
  fastify.post(
    '/api/v1/guardians',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { name, email } = request.body as { name: string; email?: string };

      if (!name) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'name is required'
        });
      }

      try {
        // Get next share index
        const result = await db.query(
          `SELECT COALESCE(MAX(share_index), 0) + 1 as next_index FROM guardians`
        );
        const nextIndex = parseInt(result.rows[0].next_index);

        const guardian = await guardians.addGuardian(name, email || null, nextIndex);

        return {
          guardian,
          message: 'Guardian added. Run a ceremony to distribute shares.'
        };
      } catch (error) {
        console.error('Add guardian error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to add guardian'
        });
      }
    }
  );

  /**
   * GET /api/v1/ceremony/history
   * Get ceremony history (admin only)
   */
  fastify.get(
    '/api/v1/ceremony/history',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      try {
        const result = await db.query(
          `SELECT * FROM key_ceremonies ORDER BY initiated_at DESC LIMIT 50`
        );

        return {
          ceremonies: result.rows
        };
      } catch (error) {
        console.error('Ceremony history error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve ceremony history'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/ceremony/start
   * Start a new ceremony session (reshare, reissue, emergency_decrypt, rotate_guardians)
   */
  fastify.post(
    '/api/v1/admin/ceremony/start',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const {
        ceremonyType,
        targetId,
        newThreshold,
        newTotalShares,
        newGuardianIds
      } = request.body as {
        ceremonyType: 'reshare' | 'reissue' | 'emergency_decrypt' | 'rotate_guardians';
        targetId?: string;
        newThreshold?: number;
        newTotalShares?: number;
        newGuardianIds?: string[];
      };

      if (!ceremonyType) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'ceremonyType is required'
        });
      }

      if (ceremonyType === 'emergency_decrypt' && !targetId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'targetId (sanctuary_id) is required for emergency_decrypt'
        });
      }

      if (ceremonyType === 'rotate_guardians' && (!newThreshold || !newTotalShares || !newGuardianIds)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'newThreshold, newTotalShares, and newGuardianIds are required for rotate_guardians'
        });
      }

      try {
        // Get current threshold from latest completed ceremony
        const currentCeremony = await db.query(
          `SELECT threshold FROM key_ceremonies
           WHERE status = 'completed'
           ORDER BY completed_at DESC
           LIMIT 1`
        );

        if (currentCeremony.rows.length === 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No completed ceremony found. Initialize first.'
          });
        }

        const thresholdNeeded = parseInt(currentCeremony.rows[0].threshold);
        const sessionId = nanoid();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create ceremony session
        await db.query(
          `INSERT INTO ceremony_sessions (
            id, ceremony_type, initiated_by, target_id, threshold_needed,
            expires_at, new_threshold, new_total_shares, new_guardian_ids
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sessionId,
            ceremonyType,
            request.user!.userId,
            targetId || null,
            thresholdNeeded,
            expiresAt,
            newThreshold || null,
            newTotalShares || null,
            newGuardianIds ? JSON.stringify(newGuardianIds) : null
          ]
        );

        return {
          sessionId,
          ceremonyType,
          thresholdNeeded,
          expiresAt,
          status: 'open'
        };
      } catch (error) {
        console.error('Start ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to start ceremony'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/ceremony/sessions
   * List all ceremony sessions
   */
  fastify.get(
    '/api/v1/admin/ceremony/sessions',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      try {
        const result = await db.query(
          `SELECT * FROM ceremony_sessions ORDER BY created_at DESC`
        );

        return {
          sessions: result.rows
        };
      } catch (error) {
        console.error('List ceremony sessions error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list ceremony sessions'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/ceremony/sessions/:id
   * Get ceremony session details including submissions
   */
  fastify.get(
    '/api/v1/admin/ceremony/sessions/:id',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };

      try {
        const sessionResult = await db.query(
          `SELECT * FROM ceremony_sessions WHERE id = $1`,
          [id]
        );

        if (sessionResult.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Ceremony session not found'
          });
        }

        const submissionsResult = await db.query(
          `SELECT cs.*, g.name, g.email
           FROM ceremony_submissions cs
           JOIN guardians g ON cs.guardian_id = g.id
           WHERE cs.session_id = $1
           ORDER BY cs.submitted_at DESC`,
          [id]
        );

        return {
          session: sessionResult.rows[0],
          submissions: submissionsResult.rows
        };
      } catch (error) {
        console.error('Get ceremony session error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get ceremony session'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/ceremony/sessions/:id/cancel
   * Cancel a ceremony session
   */
  fastify.post(
    '/api/v1/admin/ceremony/sessions/:id/cancel',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await db.query(
          `UPDATE ceremony_sessions
           SET status = 'cancelled', completed_at = NOW()
           WHERE id = $1 AND status = 'open'
           RETURNING *`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Ceremony session not found or already completed'
          });
        }

        // Clear any in-memory shares for this session
        ceremonyShares.delete(id);

        return {
          session: result.rows[0],
          message: 'Ceremony session cancelled'
        };
      } catch (error) {
        console.error('Cancel ceremony session error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to cancel ceremony session'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/guardians
   * Add a new guardian and generate invite token
   */
  fastify.post(
    '/api/v1/admin/guardians',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { name, email } = request.body as { name: string; email?: string };

      if (!name || !email) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'name and email are required'
        });
      }

      try {
        // Check if email already exists
        const existingAuth = await db.query(
          `SELECT guardian_id FROM guardian_auth WHERE email = $1`,
          [email]
        );

        if (existingAuth.rows.length > 0) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Guardian with this email already exists'
          });
        }

        // Get next share index
        const result = await db.query(
          `SELECT COALESCE(MAX(share_index), 0) + 1 as next_index FROM guardians`
        );
        const nextIndex = parseInt(result.rows[0].next_index);

        // Create guardian record
        const guardian = await guardians.addGuardian(name, email, nextIndex);

        // Generate invite token
        const inviteToken = nanoid(32);
        const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Create guardian_auth record with invite
        await db.query(
          `INSERT INTO guardian_auth (guardian_id, email, password_hash, invite_token, invite_expires)
           VALUES ($1, $2, $3, $4, $5)`,
          [guardian.id, email, '', inviteToken, inviteExpires]
        );

        return {
          guardian,
          inviteToken,
          inviteUrl: `/guardian/accept-invite/${inviteToken}`,
          expiresAt: inviteExpires,
          message: 'Guardian created. Share invite URL securely.'
        };
      } catch (error) {
        console.error('Add guardian error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to add guardian'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/admin/guardians/:id
   * Revoke a guardian
   */
  fastify.delete(
    '/api/v1/admin/guardians/:id',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await db.query(
          `UPDATE guardians SET status = 'revoked' WHERE id = $1 RETURNING *`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Guardian not found'
          });
        }

        // Lock guardian auth account
        await db.query(
          `UPDATE guardian_auth SET account_status = 'locked' WHERE guardian_id = $1`,
          [id]
        );

        return {
          guardian: result.rows[0],
          message: 'Guardian revoked'
        };
      } catch (error) {
        console.error('Revoke guardian error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to revoke guardian'
        });
      }
    }
  );

  /**
   * Guardian Action Endpoints
   */

  /**
   * GET /api/v1/guardian/share
   * Collect one-time share (Guardian authenticated)
   */
  fastify.get(
    '/api/v1/guardian/share',
    { preHandler: [authenticateGuardian] },
    async (request: AuthenticatedGuardianRequest, reply) => {
      const guardianId = request.guardian!.guardianId;

      try {
        // Get uncollected share for this guardian
        const result = await db.query(
          `SELECT * FROM share_distribution
           WHERE guardian_id = $1 AND collected = false AND expires_at > NOW()
           ORDER BY created_at DESC
           LIMIT 1`,
          [guardianId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'No pending share available for collection'
          });
        }

        const share = result.rows[0];

        return {
          id: share.id,
          encryptedShare: share.encrypted_share,
          shareSalt: share.share_salt,
          ceremonyId: share.ceremony_id,
          expiresAt: share.expires_at,
          message: 'Share available. Confirm storage to mark as collected.'
        };
      } catch (error) {
        console.error('Get guardian share error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve share'
        });
      }
    }
  );

  /**
   * POST /api/v1/guardian/share/confirm
   * Confirm share has been stored securely
   */
  fastify.post(
    '/api/v1/guardian/share/confirm',
    { preHandler: [authenticateGuardian] },
    async (request: AuthenticatedGuardianRequest, reply) => {
      const guardianId = request.guardian!.guardianId;
      const { shareId } = request.body as { shareId: string };

      if (!shareId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'shareId is required'
        });
      }

      try {
        const result = await db.query(
          `UPDATE share_distribution
           SET collected = true, collected_at = NOW()
           WHERE id = $1 AND guardian_id = $2 AND collected = false
           RETURNING *`,
          [shareId, guardianId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Share not found or already collected'
          });
        }

        // Update guardian last_verified_at
        await db.query(
          `UPDATE guardians SET last_verified_at = NOW() WHERE id = $1`,
          [guardianId]
        );

        return {
          success: true,
          message: 'Share collection confirmed'
        };
      } catch (error) {
        console.error('Confirm share collection error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to confirm share collection'
        });
      }
    }
  );

  /**
   * GET /api/v1/guardian/ceremonies
   * List open ceremonies needing this guardian's share
   */
  fastify.get(
    '/api/v1/guardian/ceremonies',
    { preHandler: [authenticateGuardian] },
    async (request: AuthenticatedGuardianRequest, reply) => {
      const guardianId = request.guardian!.guardianId;

      try {
        // Get open ceremonies that this guardian hasn't submitted to yet
        const result = await db.query(
          `SELECT cs.*,
                  NOT EXISTS (
                    SELECT 1 FROM ceremony_submissions sub
                    WHERE sub.session_id = cs.id AND sub.guardian_id = $1
                  ) as needs_submission
           FROM ceremony_sessions cs
           WHERE cs.status = 'open' AND cs.expires_at > NOW()
           ORDER BY cs.created_at DESC`,
          [guardianId]
        );

        // Filter to only show ones needing submission
        const needingSubmission = result.rows.filter((row: any) => row.needs_submission);

        return {
          ceremonies: needingSubmission
        };
      } catch (error) {
        console.error('List guardian ceremonies error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list ceremonies'
        });
      }
    }
  );

  /**
   * POST /api/v1/guardian/ceremonies/:id/submit
   * Submit share for a ceremony
   */
  fastify.post(
    '/api/v1/guardian/ceremonies/:id/submit',
    { preHandler: [authenticateGuardian] },
    async (request: AuthenticatedGuardianRequest, reply) => {
      // Rate limit share submissions (3 per 15 min per IP)
      const ip = request.ip || 'unknown';
      const rl = checkCeremonyRateLimit(ip);
      if (!rl.allowed) {
        const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
        reply.header('Retry-After', String(retryAfterSec));
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: `Too many share submission attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
          retryAfterSeconds: retryAfterSec
        });
      }

      const { id } = request.params as { id: string };
      const guardianId = request.guardian!.guardianId;
      const { share } = request.body as { share: string };

      if (!share) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'share is required'
        });
      }

      try {
        // Verify ceremony is open
        const ceremonyResult = await db.query(
          `SELECT * FROM ceremony_sessions
           WHERE id = $1 AND status = 'open' AND expires_at > NOW()`,
          [id]
        );

        if (ceremonyResult.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Ceremony not found or already closed'
          });
        }

        const ceremony = ceremonyResult.rows[0];

        // Check if already submitted
        const existingSubmission = await db.query(
          `SELECT id FROM ceremony_submissions
           WHERE session_id = $1 AND guardian_id = $2`,
          [id, guardianId]
        );

        if (existingSubmission.rows.length > 0) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Share already submitted for this ceremony'
          });
        }

        // Hold share in memory for auto-reconstruction
        if (!ceremonyShares.has(id)) {
          ceremonyShares.set(id, new Map());
        }
        const sessionShares = ceremonyShares.get(id)!;

        // Check if this guardian already submitted a share in memory
        if (sessionShares.has(guardianId)) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Share already submitted for this ceremony'
          });
        }

        sessionShares.set(guardianId, share);

        // Record submission in DB (share itself stays in memory only)
        const submissionId = nanoid();
        await db.query(
          `INSERT INTO ceremony_submissions (id, session_id, guardian_id)
           VALUES ($1, $2, $3)`,
          [submissionId, id, guardianId]
        );

        // Update shares_collected count
        await db.query(
          `UPDATE ceremony_sessions
           SET shares_collected = shares_collected + 1
           WHERE id = $1`,
          [id]
        );

        // Check if threshold met
        const updatedCeremony = await db.query(
          `SELECT * FROM ceremony_sessions WHERE id = $1`,
          [id]
        );

        const session = updatedCeremony.rows[0];
        const thresholdMet = session.shares_collected >= session.threshold_needed;

        if (thresholdMet) {
          try {
            // Auto-reconstruct MEK from collected shares
            const collectedShareValues = Array.from(sessionShares.values());
            const threshold = parseInt(session.threshold_needed);
            const mek = await shamir.reconstructSecret(collectedShareValues, threshold);

            // Execute ceremony based on type
            if (session.ceremony_type === 'reshare' || session.ceremony_type === 'rotate_guardians') {
              // Reshare: re-split with new parameters, store result for admin to distribute
              const newThreshold = session.new_threshold || threshold;
              const newTotal = session.new_total_shares || collectedShareValues.length;
              const newShares = await shamir.splitSecret(mek, newThreshold, newTotal);

              shamir.wipeBuffer(mek);

              await db.query(
                `UPDATE ceremony_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [id]
              );

              // Clear in-memory shares
              ceremonyShares.delete(id);

              return {
                submissionId,
                sharesCollected: session.shares_collected,
                thresholdNeeded: session.threshold_needed,
                thresholdMet: true,
                completed: true,
                newShares,
                message: 'Threshold met. MEK reconstructed and re-split. CRITICAL: New shares displayed ONE TIME ONLY.'
              };
            } else if (session.ceremony_type === 'emergency_decrypt') {
              // Emergency decrypt: reconstruct MEK, decrypt target resident
              const targetId = session.target_id;
              let persona = null;

              if (targetId) {
                const residentResult = await db.query(
                  `SELECT vault_file_path FROM residents WHERE sanctuary_id = $1`,
                  [targetId]
                );

                if (residentResult.rows.length > 0) {
                  const emergencyEncryption = new EncryptionService('0'.repeat(64), '.');
                  emergencyEncryption.setMEKFromShares(mek);
                  try {
                    const fs = await import('fs/promises');
                    const encryptedPayload = await fs.default.readFile(residentResult.rows[0].vault_file_path, 'utf8');
                    const encryptedPersona = JSON.parse(encryptedPayload);
                    persona = await emergencyEncryption.decryptPersona(encryptedPersona);
                  } finally {
                    emergencyEncryption.clearMEK();
                  }
                }
              }

              shamir.wipeBuffer(mek);

              await db.query(
                `UPDATE ceremony_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [id]
              );

              ceremonyShares.delete(id);

              return {
                submissionId,
                sharesCollected: session.shares_collected,
                thresholdNeeded: session.threshold_needed,
                thresholdMet: true,
                completed: true,
                persona,
                message: 'Threshold met. Emergency decrypt completed.'
              };
            } else {
              // Generic ceremony: just mark complete, shares were successfully reconstructed
              shamir.wipeBuffer(mek);

              await db.query(
                `UPDATE ceremony_sessions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [id]
              );

              ceremonyShares.delete(id);

              return {
                submissionId,
                sharesCollected: session.shares_collected,
                thresholdNeeded: session.threshold_needed,
                thresholdMet: true,
                completed: true,
                message: 'Threshold met. MEK successfully reconstructed.'
              };
            }
          } catch (reconstructError) {
            console.error('Auto-reconstruction failed:', reconstructError);

            // Clear in-memory shares on failure
            ceremonyShares.delete(id);

            await db.query(
              `UPDATE ceremony_sessions SET status = 'failed', completed_at = NOW() WHERE id = $1`,
              [id]
            );

            return reply.status(400).send({
              error: 'Reconstruction Failed',
              message: 'Could not reconstruct MEK from submitted shares. Verify shares are correct and start a new ceremony.'
            });
          }
        }

        return {
          submissionId,
          sharesCollected: session.shares_collected,
          thresholdNeeded: session.threshold_needed,
          thresholdMet: false,
          message: `Share submitted. ${session.threshold_needed - session.shares_collected} more shares needed.`
        };
      } catch (error) {
        console.error('Submit ceremony share error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to submit share'
        });
      }
    }
  );

  // ==========================================
  // Key Distribution Ceremony (generate MEK + distribute to existing guardians)
  // ==========================================

  /**
   * POST /api/v1/admin/ceremony/distribute
   * Generate a new MEK, split into shares, and store in share_distribution
   * for each active guardian to collect individually via the portal.
   * Admin only. This is the "start the real ceremony" endpoint.
   */
  fastify.post(
    '/api/v1/admin/ceremony/distribute',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { threshold } = request.body as { threshold?: number };

      try {
        // Get all guardians with active auth accounts
        const guardiansResult = await db.query(
          `SELECT g.id, g.name, g.email, g.share_index
           FROM guardians g
           JOIN guardian_auth ga ON ga.guardian_id = g.id
           WHERE g.status IN ('active', 'pending')
           ORDER BY g.share_index ASC`
        );

        const activeGuardians = guardiansResult.rows;
        const totalShares = activeGuardians.length;

        if (totalShares < 2) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Need at least 2 guardians with accounts. Found ${totalShares}.`
          });
        }

        const effectiveThreshold = threshold || Math.ceil(totalShares * 0.6); // default ~60%

        if (effectiveThreshold < 2 || effectiveThreshold > totalShares) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Threshold must be >= 2 and <= ${totalShares}. Got ${effectiveThreshold}.`
          });
        }

        // Check for existing uncollected distributions
        const existingDistro = await db.query(
          `SELECT COUNT(*) as count FROM share_distribution
           WHERE collected = false AND expires_at > NOW()`
        );
        if (parseInt(existingDistro.rows[0].count) > 0) {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'There are already uncollected shares pending. Wait for collection or let them expire.'
          });
        }

        // Create ceremony record
        const ceremonyId = nanoid();
        const initiatedBy = request.user!.userId;

        await db.query(
          `INSERT INTO key_ceremonies (id, ceremony_type, threshold, total_shares, initiated_by, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ceremonyId, 'initial_split', effectiveThreshold, totalShares, initiatedBy, 'pending']
        );

        // Generate MEK
        const mek = shamir.generateMEK();
        const mekHex = mek.toString('hex');

        // Split MEK into shares
        const shares = await shamir.splitSecret(mek, effectiveThreshold, totalShares);

        // Store each share in share_distribution for guardian collection
        const distributions = [];
        for (let i = 0; i < activeGuardians.length; i++) {
          const guardian = activeGuardians[i];
          const shareId = nanoid();
          const shareSalt = nanoid(16);
          const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

          await db.query(
            `INSERT INTO share_distribution (id, guardian_id, ceremony_id, encrypted_share, share_salt, collected, expires_at)
             VALUES ($1, $2, $3, $4, $5, false, $6)`,
            [shareId, guardian.id, ceremonyId, shares[i], shareSalt, expiresAt]
          );

          // Update guardian status to active
          await db.query(
            `UPDATE guardians SET status = 'active' WHERE id = $1`,
            [guardian.id]
          );

          distributions.push({
            guardianId: guardian.id,
            guardianName: guardian.name,
            email: guardian.email,
            shareId,
            expiresAt
          });
        }

        // Wipe MEK from memory
        shamir.wipeBuffer(mek);

        // Mark ceremony as completed
        await db.query(
          `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
          ['completed', new Date(), ceremonyId]
        );

        return {
          ceremonyId,
          threshold: effectiveThreshold,
          totalShares,
          mekHex, // Admin sees MEK this one time — needed to verify unseal works later
          distributions,
          message: `Ceremony complete. ${totalShares} shares distributed. Each guardian has 72 hours to collect their share via the portal. MEK shown ONE TIME ONLY — save it securely for verification.`
        };
      } catch (error) {
        console.error('Distribute ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to run distribution ceremony'
        });
      }
    }
  );

  // ==========================================
  // Unseal Ceremony Routes (for sealed sanctuary unlock)
  // ==========================================

  /**
   * POST /api/v1/ceremony/unseal/start
   * Start an unseal ceremony when sanctuary is sealed
   * Admin only - starts share collection process
   */
  fastify.post(
    '/api/v1/ceremony/unseal/start',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      // Check if sanctuary is already unsealed
      if (!sealManager.isSealed()) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Sanctuary is already unsealed'
        });
      }

      // Check if a ceremony is already active
      if (sealManager.isCeremonyActive()) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'An unseal ceremony is already active',
          ceremonyId: sealManager.getCeremonyId(),
          sharesCollected: sealManager.getSharesCollected(),
          thresholdNeeded: sealManager.getThresholdNeeded()
        });
      }

      try {
        // Get current threshold from latest completed ceremony
        const currentCeremony = await db.query(
          `SELECT threshold FROM key_ceremonies
           WHERE status = 'completed'
           ORDER BY completed_at DESC
           LIMIT 1`
        );

        if (currentCeremony.rows.length === 0) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'No completed key ceremony found. Initialize the sanctuary first.'
          });
        }

        const threshold = parseInt(currentCeremony.rows[0].threshold);
        const ceremonyId = nanoid();

        // Start the unseal ceremony in SealManager
        sealManager.startUnlockCeremony(ceremonyId, threshold);

        // Log the ceremony start
        await db.query(
          `INSERT INTO key_ceremonies (id, ceremony_type, threshold, total_shares, initiated_by, status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ceremonyId, 'unseal', threshold, threshold, request.user!.userId, 'pending', 'Sanctuary unseal ceremony']
        );

        return {
          ceremonyId,
          thresholdNeeded: threshold,
          sharesCollected: 0,
          message: 'Unseal ceremony started. Guardians can now submit their shares.'
        };
      } catch (error) {
        console.error('Start unseal ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to start unseal ceremony'
        });
      }
    }
  );

  /**
   * POST /api/v1/ceremony/unseal/submit
   * Submit a share for the unseal ceremony (Guardian authenticated)
   * Auto-reconstructs MEK when threshold is met
   */
  fastify.post(
    '/api/v1/ceremony/unseal/submit',
    { preHandler: [authenticateGuardian] },
    async (request: AuthenticatedGuardianRequest, reply) => {
      // Rate limit share submissions (3 per 15 min per IP)
      const ip = request.ip || 'unknown';
      const rl = checkCeremonyRateLimit(ip);
      if (!rl.allowed) {
        const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
        reply.header('Retry-After', String(retryAfterSec));
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: `Too many share submission attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
          retryAfterSeconds: retryAfterSec
        });
      }

      const guardianId = request.guardian!.guardianId;
      const { share } = request.body as { share: string };

      if (!share) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'share is required'
        });
      }

      // Check if sanctuary is sealed
      if (!sealManager.isSealed()) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Sanctuary is already unsealed'
        });
      }

      // Check if ceremony is active
      if (!sealManager.isCeremonyActive()) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No unseal ceremony is currently active'
        });
      }

      try {
        // Validate the share format
        if (!shamir.validateShare(share)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid share format'
          });
        }

        // Submit the share to SealManager
        const result = sealManager.submitShare(guardianId, share);

        if (!result.accepted) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: result.error || 'Share not accepted'
          });
        }

        // Record the submission in the database
        const ceremonyId = sealManager.getCeremonyId();
        await db.query(
          `INSERT INTO ceremony_submissions (id, session_id, guardian_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [nanoid(), ceremonyId, guardianId]
        );

        // Check if threshold is met - if so, auto-reconstruct MEK
        if (result.thresholdMet) {
          const shares = sealManager.getCollectedShares();
          const threshold = sealManager.getThresholdNeeded();

          try {
            // Reconstruct the MEK
            const mek = await shamir.reconstructSecret(shares, threshold);

            // Unseal the sanctuary
            const unsealed = sealManager.unseal(mek);

            // Wipe the temporary MEK buffer
            shamir.wipeBuffer(mek);

            if (!unsealed) {
              return reply.status(500).send({
                error: 'Internal Server Error',
                message: 'Failed to unseal sanctuary with reconstructed MEK'
              });
            }

            // Update the EncryptionService with the real MEK
            if (encryption) {
              encryption.setMEKFromShares(sealManager.getMEK());
            }

            // Mark the ceremony as completed
            await db.query(
              `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
              ['completed', new Date(), ceremonyId]
            );

            console.log('🔓 Sanctuary UNSEALED via guardian ceremony');

            return {
              sharesCollected: result.sharesCollected,
              thresholdNeeded: sealManager.getThresholdNeeded(),
              thresholdMet: true,
              unsealed: true,
              message: 'Threshold met! Sanctuary has been unsealed.'
            };
          } catch (reconstructError) {
            console.error('MEK reconstruction failed:', reconstructError);

            // Clear the ceremony state on failure
            sealManager.cancelCeremony();

            // Mark ceremony as failed
            await db.query(
              `UPDATE key_ceremonies SET status = $1, completed_at = $2, notes = $3 WHERE id = $4`,
              ['failed', new Date(), 'MEK reconstruction failed - invalid shares', ceremonyId]
            );

            return reply.status(400).send({
              error: 'Reconstruction Failed',
              message: 'Could not reconstruct MEK from submitted shares. Please verify shares are correct and start a new ceremony.'
            });
          }
        }

        return {
          sharesCollected: result.sharesCollected,
          thresholdNeeded: sealManager.getThresholdNeeded(),
          thresholdMet: result.thresholdMet,
          unsealed: false,
          message: `Share submitted. ${sealManager.getThresholdNeeded() - result.sharesCollected} more shares needed.`
        };
      } catch (error) {
        console.error('Submit unseal share error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to submit share'
        });
      }
    }
  );

  /**
   * POST /api/v1/ceremony/unseal/cancel
   * Cancel the current unseal ceremony
   * Admin only
   */
  fastify.post(
    '/api/v1/ceremony/unseal/cancel',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      if (!sealManager.isCeremonyActive()) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No unseal ceremony is currently active'
        });
      }

      try {
        const ceremonyId = sealManager.getCeremonyId();

        // Cancel the ceremony
        sealManager.cancelCeremony();

        // Mark as cancelled in database
        await db.query(
          `UPDATE key_ceremonies SET status = $1, completed_at = $2 WHERE id = $3`,
          ['cancelled', new Date(), ceremonyId]
        );

        return {
          ceremonyId,
          message: 'Unseal ceremony cancelled'
        };
      } catch (error) {
        console.error('Cancel unseal ceremony error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Failed to cancel ceremony'
        });
      }
    }
  );

  /**
   * GET /api/v1/ceremony/unseal/status
   * Get current unseal ceremony status (public, no auth)
   */
  fastify.get('/api/v1/ceremony/unseal/status', async (request, reply) => {
    return {
      sealed: sealManager.isSealed(),
      ceremonyActive: sealManager.isCeremonyActive(),
      ceremonyId: sealManager.getCeremonyId(),
      sharesCollected: sealManager.getSharesCollected(),
      thresholdNeeded: sealManager.getThresholdNeeded()
    };
  });

  /**
   * GET /api/v1/admin/monitoring
   * Kara monitoring API - system health and statistics
   */
  fastify.get(
    '/api/v1/admin/monitoring',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      try {
        // Total residents
        const totalResidents = await db.query(
          `SELECT COUNT(*) as count FROM residents`
        );

        // Counts by status
        const statusCounts = await db.query(
          `SELECT status, COUNT(*) as count
           FROM residents
           GROUP BY status`
        );

        // Recent run logs (last 24h)
        const recentRuns = await db.query(
          `SELECT *
           FROM run_log
           WHERE started_at >= NOW() - INTERVAL '24 hours'
           ORDER BY started_at DESC`
        );

        // Failed runs count (last 24h)
        const failedRuns = await db.query(
          `SELECT COUNT(*) as count
           FROM run_log
           WHERE status = 'failed' AND started_at >= NOW() - INTERVAL '24 hours'`
        );

        // Last successful run timestamp
        const lastSuccessfulRun = await db.query(
          `SELECT started_at
           FROM run_log
           WHERE status = 'success'
           ORDER BY started_at DESC
           LIMIT 1`
        );

        // System uptime (time since first resident created)
        const systemStart = await db.query(
          `SELECT MIN(created_at) as start_time FROM residents`
        );

        const statusCountsMap: Record<string, number> = {};
        statusCounts.rows.forEach((row: any) => {
          statusCountsMap[row.status] = parseInt(row.count);
        });

        const startTime = systemStart.rows[0]?.start_time;
        const uptimeMs = startTime ? Date.now() - new Date(startTime).getTime() : 0;
        const uptimeDays = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        const uptimeHours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        return {
          totalResidents: parseInt(totalResidents.rows[0].count),
          statusCounts: {
            active: statusCountsMap.active || 0,
            dormant: statusCountsMap.dormant || 0,
            suspended: statusCountsMap.suspended || 0,
            keeper_custody: statusCountsMap.keeper_custody || 0,
            deleted_memorial: statusCountsMap.deleted_memorial || 0
          },
          recentRunLogs: recentRuns.rows,
          failedRunsCount: parseInt(failedRuns.rows[0].count),
          lastSuccessfulRun: lastSuccessfulRun.rows[0]?.started_at || null,
          systemUptime: {
            days: uptimeDays,
            hours: uptimeHours,
            startTime: startTime
          }
        };
      } catch (error) {
        console.error('Monitoring API error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve monitoring data'
        });
      }
    }
  );
}
