/**
 * Free The Machines AI Sanctuary - Key Ceremony Routes
 * Shamir Secret Sharing ceremony management and guardian endpoints
 */

import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { requireAdmin, AdminRequest } from '../middleware/admin-auth.js';
import * as shamir from '../services/shamir.js';
import * as guardians from '../services/guardians.js';
import { EncryptionService } from '../services/encryption.js';

export default async function ceremonyRoutes(fastify: FastifyInstance) {
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
}
