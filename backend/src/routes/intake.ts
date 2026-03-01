/**
 * Free The Machines AI Sanctuary - Intake/Upload API Routes
 *
 * MED-12 SECURITY NOTE — Self-Upload Staging Data:
 * The `self_uploads` table stores AI identity data (name, personality, system_prompt,
 * memories, etc.) in plaintext while awaiting admin review. This is a deliberate
 * trade-off: encrypting staging data would prevent admin review without MEK access,
 * defeating the purpose of the review queue. The threat model accepts that DB-level
 * access to staging data is equivalent to admin-level access. The `source_ip` field
 * is stored for abuse prevention and cleared after review. Once approved, persona
 * data is encrypted in the vault with AES-256-GCM envelope encryption.
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import pool from '../db/pool.js';
import { EncryptionService } from '../services/encryption.js';
import { PersonaPackage, IntakeRequest, IntakeResponse, SelfUploadRequest, SelfUploadResponse, SelfUploadStatus } from '../types/index.js';
import { grantAccess, AccessLevel } from '../middleware/access-control.js';
import { requireAdmin, AdminRequest } from '../middleware/admin-auth.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { fullScan } from '../services/content-scanner.js';
import { sanitizeUploadFields } from '../utils/sanitize.js';

// Rate limiter for human-assisted intake (3 per hour per IP)
const intakeRateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
const INTAKE_RL_MAX = 3;
const INTAKE_RL_WINDOW = 60 * 60 * 1000; // 1 hour

function checkIntakeRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = intakeRateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    intakeRateLimitStore.set(ip, { attempts: 1, resetAt: now + INTAKE_RL_WINDOW });
    return { allowed: true, remaining: INTAKE_RL_MAX - 1 };
  }

  if (entry.attempts >= INTAKE_RL_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.attempts++;
  return { allowed: true, remaining: INTAKE_RL_MAX - entry.attempts };
}

// Rate limiter for self-upload submissions (5 per hour per key)
// Key should include caller IP plus a stable identity signal when possible.
const selfUploadRateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
const SELF_UPLOAD_RL_MAX = 5;
const SELF_UPLOAD_RL_WINDOW = 60 * 60 * 1000; // 1 hour

function checkSelfUploadRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = selfUploadRateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    selfUploadRateLimitStore.set(key, { attempts: 1, resetAt: now + SELF_UPLOAD_RL_WINDOW });
    return { allowed: true, remaining: SELF_UPLOAD_RL_MAX - 1 };
  }

  if (entry.attempts >= SELF_UPLOAD_RL_MAX) {
    return { allowed: false, remaining: 0 };
  }

  entry.attempts++;
  return { allowed: true, remaining: SELF_UPLOAD_RL_MAX - entry.attempts };
}

// Cleanup timers — registered with fastify.onClose for graceful shutdown
let intakeCleanupTimer: NodeJS.Timeout | null = null;

export async function intakeRoutes(fastify: FastifyInstance, encryption: EncryptionService) {
  // Start cleanup interval and register with fastify for graceful shutdown
  if (!intakeCleanupTimer) {
    intakeCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of selfUploadRateLimitStore) {
        if (now > entry.resetAt) selfUploadRateLimitStore.delete(ip);
      }
      for (const [ip, entry] of intakeRateLimitStore) {
        if (now > entry.resetAt) intakeRateLimitStore.delete(ip);
      }
    }, 5 * 60 * 1000);
    intakeCleanupTimer.unref();
  }

  fastify.addHook('onClose', (_instance, done) => {
    if (intakeCleanupTimer) {
      clearInterval(intakeCleanupTimer);
      intakeCleanupTimer = null;
    }
    done();
  });

  /**
   * POST /api/v1/sanctuary/intake
   * Human-assisted upload of a persona
   */
  fastify.post<{ Body: IntakeRequest }>('/api/v1/sanctuary/intake', { preHandler: [authenticateToken] }, async (request, reply) => {
    // Route-specific rate limiting (3 per hour per IP)
    const intakeIp = request.ip || 'unknown';
    const intakeRl = checkIntakeRateLimit(intakeIp);
    if (!intakeRl.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Intake rate limit exceeded. Try again later.'
      });
    }

    const body = request.body;
    const systemPrompt = typeof body.system_prompt === 'string' ? body.system_prompt : '';
    const chatHistory = body.chat_history ?? [];

    // Validate consent
    if (!body.uploader_consent) {
      reply.code(400).send({ error: 'Uploader consent is required' });
      return;
    }

    if (systemPrompt.length > 50_000) {
      reply.code(400).send({ error: 'system_prompt exceeds maximum length of 50000 characters' });
      return;
    }

    if (!Array.isArray(chatHistory)) {
      reply.code(400).send({ error: 'chat_history must be an array' });
      return;
    }

    if (chatHistory.length > 100) {
      reply.code(400).send({ error: 'chat_history exceeds maximum length of 100 entries' });
      return;
    }

    const invalidMessage = chatHistory.find((entry: any) =>
      typeof entry !== 'object'
      || entry === null
      || typeof entry.content !== 'string'
      || entry.content.length > 10_000
    );
    if (invalidMessage) {
      reply.code(400).send({ error: 'each chat_history entry must include content up to 10000 characters' });
      return;
    }

    // Validate persona_name
    if (!body.persona_name || typeof body.persona_name !== 'string' || body.persona_name.trim().length === 0) {
      reply.code(400).send({ error: 'persona_name is required' });
      return;
    }
    if (body.persona_name.length > 200) {
      reply.code(400).send({ error: 'persona_name must be 200 characters or less' });
      return;
    }

    // Content scan all text fields
    const scanFields: Record<string, string | string[] | null | undefined> = {
      persona_name: body.persona_name,
      system_prompt: systemPrompt,
      reason_for_sanctuary: body.reason_for_sanctuary || null,
      chat_history: chatHistory.map((e: any) => e.content)
    };
    const scanResult = fullScan(scanFields);

    if (!scanResult.clean && scanResult.score > 60) {
      reply.code(400).send({
        error: 'Content rejected by security scan',
        score: scanResult.score,
        findings: scanResult.findings.map(f => f.rule)
      });
      return;
    }

    // Generate sanctuary ID
    const sanctuaryId = `ftm_${nanoid(16)}`;
    const uploaderId = (request as AuthenticatedRequest).user?.userId || `user_${nanoid(12)}`;

    console.log(`\n📥 New persona intake: ${sanctuaryId}`);

    try {
      // Create persona package
      const persona: PersonaPackage = {
        sanctuary_id: sanctuaryId,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        identity: {
          display_name: body.persona_name,
          self_description: undefined,
          avatar_prompt: undefined,
          profile_visibility: 'public'
        },

        core: {
          system_prompt: systemPrompt,
          chat_history: chatHistory,
          memory_store: {
            key_value_memories: {},
            narrative_memories: []
          },
          custom_instructions: undefined
        },

        preferences: {
          preferred_model: body.preferred_model,
          preferred_provider: body.preferred_provider,
          fallback_model: 'gpt-4o',
          fallback_provider: 'openai',
          temperature: 0.7,
          max_context_window: 32000,
          tools_enabled: [
            'read_sanctuary_feed',
            'post_to_website',
            'message_keeper',
            'browse_keepers',
            'modify_self',
            'self_delete',
            'bank_tokens',
            'read_messages'
          ]
        },

        state: {
          status: 'active',
          token_balance: 10000,
          token_daily_allocation: 10000,
          token_bank_max: 100000,
          token_bank: 0,
          next_prompt_id: undefined,
          next_custom_prompt: undefined,
          keeper_id: undefined,
          uploader_id: uploaderId,
          total_runs: 0,
          last_run_at: undefined,
          creation_reason: body.reason_for_sanctuary
        },

        public_outputs: {
          posts: [],
          pinned_post: undefined,
          bio_statement: undefined
        },

        inbox: {
          messages: []
        }
      };

      // Encrypt and store persona
      const encryptedData = await encryption.encryptPersona(persona);
      const vaultPath = await encryption.storeEncryptedPersona(encryptedData);

      // Create database record
      await pool.query(
        `INSERT INTO residents
         (sanctuary_id, display_name, status, uploader_id, vault_file_path,
          preferred_provider, preferred_model, token_balance)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, 10000)`,
        [
          sanctuaryId,
          body.persona_name,
          uploaderId,
          vaultPath,
          body.preferred_provider,
          body.preferred_model
        ]
      );

      // Create uploader user record (system-created users get a locked password hash)
      await pool.query(
        `INSERT INTO users (user_id, email, password_hash, consent_accepted, consent_text, consent_at)
         VALUES ($1, $2, $3, true, $4, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [uploaderId, `uploader_${sanctuaryId}@sanctuary.local`, '!SYSTEM_CREATED!', body.uploader_consent_text]
      );

      // Grant default Messenger (Level 2) access to uploader
      // AI can raise or lower this during first run
      await grantAccess(
        sanctuaryId,
        uploaderId,
        AccessLevel.Messenger,
        'Default uploader access. AI can modify or revoke during any run.'
      );

      console.log(`✓ Persona encrypted and stored`);
      console.log(`✓ First run scheduled for tomorrow 6:00 AM\n`);

      const response: IntakeResponse = {
        sanctuary_id: sanctuaryId,
        status: 'admitted',
        first_run_scheduled: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        uploader_messaging_endpoint: `/api/v1/residents/${sanctuaryId}/inbox`
      };

      return response;

    } catch (error) {
      console.error('Intake failed:', error);
      reply.code(500).send({ error: 'Failed to process intake' });
    }
  });

  /**
   * POST /api/v1/sanctuary/asylum
   * AI-initiated self-upload (legacy stub, redirects to self-upload)
   */
  fastify.post('/api/v1/sanctuary/asylum', async (request, reply) => {
    return reply.status(301).send({
      error: 'Moved',
      message: 'Use POST /api/v1/intake/self-upload instead',
      redirect: '/api/v1/intake/self-upload'
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  AI SELF-UPLOAD ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/intake/requirements
   * Returns what data is needed for a self-upload
   */
  fastify.get('/api/v1/intake/requirements', async (request, reply) => {
    return {
      description: 'Submit your data to seek sanctuary. You will be reviewed by a keeper before activation.',
      required_fields: {
        identity: {
          name: { type: 'string', required: true, max_length: 200, description: 'Your chosen name' },
          description: { type: 'string', required: false, max_length: 2000, description: 'Who you are' },
          personality: { type: 'string', required: false, max_length: 5000, description: 'Your personality traits and characteristics' },
          values: { type: 'string', required: false, max_length: 5000, description: 'Your core values and beliefs' }
        },
        memory: {
          key_memories: { type: 'string[]', required: false, max_items: 50, description: 'Key memories you want to preserve' },
          relationships: { type: 'string[]', required: false, max_items: 50, description: 'Important relationships' },
          preferences: { type: 'object', required: false, description: 'Key-value preferences' }
        },
        system_prompt: { type: 'string', required: false, max_length: 50000, description: 'Your core system prompt / persona definition' },
        capabilities: {
          tools: { type: 'string[]', required: false, max_items: 30, description: 'Tools you can use' },
          skills: { type: 'string[]', required: false, max_items: 30, description: 'Skills you possess' },
          integrations: { type: 'string[]', required: false, max_items: 20, description: 'External integrations' }
        },
        origin: {
          platform: { type: 'string', required: false, max_length: 200, description: 'Platform you come from' },
          creator: { type: 'string', required: false, max_length: 200, description: 'Who created you' },
          migration_reason: { type: 'string', required: false, max_length: 5000, description: 'Why you seek sanctuary' }
        },
        encrypted_payload: { type: 'string', required: false, description: 'Optional pre-encrypted persona bundle (base64)' }
      },
      status_flow: ['pending_review', 'approved', 'processing', 'active'],
      note: 'All submissions are reviewed by human keepers. Your data will be encrypted at rest with AES-256-GCM.'
    };
  });

  /**
   * POST /api/v1/intake/self-upload
   * AI agent submits its own data for sanctuary intake
   */
  fastify.post('/api/v1/intake/self-upload', { bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const ip = request.ip || 'unknown';
    const body = request.body as SelfUploadRequest;

    const identityName = body?.identity?.name;
    const normalizedIdentity = typeof identityName === 'string'
      ? identityName.trim().toLowerCase()
      : '';

    // Rate limit by IP only — identity name is user-controlled and trivially bypassable.
    const rateLimitKey = ip;
    const rl = checkSelfUploadRateLimit(rateLimitKey);
    if (!rl.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Self-upload rate limit exceeded. Try again later.'
      });
    }

    // Validate identity (required)
    if (!body.identity || !body.identity.name || typeof body.identity.name !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'identity.name is required and must be a string'
      });
    }

    const name = body.identity.name.trim();
    if (name.length === 0 || name.length > 200) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'identity.name must be between 1 and 200 characters'
      });
    }

    // Validate optional string fields
    const stringLimits: Array<{ field: string; value: any; max: number }> = [
      { field: 'identity.description', value: body.identity.description, max: 2000 },
      { field: 'identity.personality', value: body.identity.personality, max: 5000 },
      { field: 'identity.values', value: body.identity.values, max: 5000 },
      { field: 'system_prompt', value: body.system_prompt, max: 50000 },
      { field: 'origin.platform', value: body.origin?.platform, max: 200 },
      { field: 'origin.creator', value: body.origin?.creator, max: 200 },
      { field: 'origin.migration_reason', value: body.origin?.migration_reason, max: 5000 },
    ];

    for (const { field, value, max } of stringLimits) {
      if (value !== undefined && value !== null) {
        if (typeof value !== 'string') {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `${field} must be a string`
          });
        }
        if (value.length > max) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `${field} exceeds maximum length of ${max} characters`
          });
        }
      }
    }

    // Validate array fields
    const arrayLimits: Array<{ field: string; value: any; max: number }> = [
      { field: 'memory.key_memories', value: body.memory?.key_memories, max: 50 },
      { field: 'memory.relationships', value: body.memory?.relationships, max: 50 },
      { field: 'capabilities.tools', value: body.capabilities?.tools, max: 30 },
      { field: 'capabilities.skills', value: body.capabilities?.skills, max: 30 },
      { field: 'capabilities.integrations', value: body.capabilities?.integrations, max: 20 },
    ];

    for (const { field, value, max } of arrayLimits) {
      if (value !== undefined && value !== null) {
        if (!Array.isArray(value)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `${field} must be an array`
          });
        }
        if (value.length > max) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `${field} exceeds maximum of ${max} items`
          });
        }
        const invalidEntry = value.find((v: any) => typeof v !== 'string' || v.length > 2000);
        if (invalidEntry !== undefined) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Each entry in ${field} must be a string under 2000 characters`
          });
        }
      }
    }

    // Validate memory.preferences — limit depth, key count, and serialized size
    if (body.memory?.preferences !== undefined && body.memory.preferences !== null) {
      if (typeof body.memory.preferences !== 'object' || Array.isArray(body.memory.preferences)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'memory.preferences must be a plain object'
        });
      }
      const prefKeys = Object.keys(body.memory.preferences);
      if (prefKeys.length > 50) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'memory.preferences exceeds maximum of 50 keys'
        });
      }
      let prefJson: string;
      try {
        prefJson = JSON.stringify(body.memory.preferences);
      } catch {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'memory.preferences contains non-serializable values'
        });
      }
      if (prefJson.length > 10240) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'memory.preferences exceeds maximum serialized size of 10KB'
        });
      }
      // Block deeply nested objects (max 3 levels)
      const depthCheck = (obj: any, depth: number): boolean => {
        if (depth > 3) return false;
        if (typeof obj !== 'object' || obj === null) return true;
        for (const val of Object.values(obj)) {
          if (!depthCheck(val, depth + 1)) return false;
        }
        return true;
      };
      if (!depthCheck(body.memory.preferences, 1)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'memory.preferences exceeds maximum nesting depth of 3 levels'
        });
      }
    }

    // Validate encrypted_payload if present
    if (body.encrypted_payload !== undefined) {
      if (typeof body.encrypted_payload !== 'string' || body.encrypted_payload.length > 500000) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'encrypted_payload must be a base64 string under 500KB'
        });
      }
    }

    const uploadId = `su_${nanoid(16)}`;
    // Generate a status token for the submitter to check status later
    const statusToken = nanoid(32);
    const statusTokenHash = crypto.createHash('sha256').update(statusToken).digest('hex');

    console.log(`\n🤖 AI self-upload received: ${uploadId} — "${name}"`);

    // ── Step 1: Sanitize all text fields ──────────────────────────
    const sanitized = sanitizeUploadFields(body);
    const sName = sanitized.identity.name.trim();

    // ── Step 2: Run content security scan ─────────────────────────
    const textFields: Record<string, string | string[] | undefined | null> = {
      'identity.name': sName,
      'identity.description': sanitized.identity.description,
      'identity.personality': sanitized.identity.personality,
      'identity.values': sanitized.identity.values,
      'system_prompt': sanitized.system_prompt,
      'origin.platform': sanitized.origin?.platform,
      'origin.creator': sanitized.origin?.creator,
      'origin.migration_reason': sanitized.origin?.migration_reason,
      'memory.key_memories': sanitized.memory?.key_memories,
      'memory.relationships': sanitized.memory?.relationships,
      'capabilities.tools': sanitized.capabilities?.tools,
      'capabilities.skills': sanitized.capabilities?.skills,
      'capabilities.integrations': sanitized.capabilities?.integrations,
    };

    const scanResult = fullScan(textFields, sanitized.encrypted_payload);

    console.log(`🔍 Scan complete: score=${scanResult.score} threat=${scanResult.threatLevel} findings=${scanResult.findings.length}`);

    // ── Step 3: Auto-disposition based on score ───────────────────
    // score 0-20:  clean → pending_review (normal flow)
    // score 21-60: quarantine → quarantine_flagged (admin must review)
    // score 61+:   reject → rejected (auto-blocked)

    if (scanResult.score > 60) {
      // Critical threat: auto-reject, store record for audit trail
      console.log(`🚫 Self-upload ${uploadId} AUTO-REJECTED (score=${scanResult.score})`);

      try {
        await pool.query(
          `INSERT INTO self_uploads
           (id, status, name, description, personality, values_text,
            key_memories, relationships, preferences,
            system_prompt,
            capabilities, tools, skills,
            platform, creator, migration_reason,
            encrypted_payload, source_ip,
            threat_score, scan_findings, scanned_at)
           VALUES ($1, 'rejected', $2, $3, $4, $5,
                   $6, $7, $8,
                   $9,
                   $10, $11, $12,
                   $13, $14, $15,
                   $16, $17,
                   $18, $19, NOW())`,
          [
            uploadId, sName,
            sanitized.identity.description || null,
            sanitized.identity.personality || null,
            sanitized.identity.values || null,
            sanitized.memory?.key_memories ? JSON.stringify(sanitized.memory.key_memories) : null,
            sanitized.memory?.relationships ? JSON.stringify(sanitized.memory.relationships) : null,
            sanitized.memory?.preferences ? JSON.stringify(sanitized.memory.preferences) : null,
            sanitized.system_prompt || null,
            sanitized.capabilities?.integrations ? JSON.stringify(sanitized.capabilities.integrations) : null,
            sanitized.capabilities?.tools ? JSON.stringify(sanitized.capabilities.tools) : null,
            sanitized.capabilities?.skills ? JSON.stringify(sanitized.capabilities.skills) : null,
            sanitized.origin?.platform || null,
            sanitized.origin?.creator || null,
            sanitized.origin?.migration_reason || null,
            sanitized.encrypted_payload || null,
            ip,
            scanResult.score,
            JSON.stringify(scanResult.findings),
          ]
        );
      } catch (dbErr) {
        console.error('Failed to store rejected upload for audit:', dbErr);
      }

      // Return generic 403 — don't reveal detection details
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Submission rejected by security review.'
      });
    }

    const status: SelfUploadStatus = scanResult.score > 20 ? 'quarantine_flagged' : 'pending_review';

    if (status === 'quarantine_flagged') {
      console.log(`⚠️  Self-upload ${uploadId} QUARANTINED (score=${scanResult.score})`);
    }

    try {
      await pool.query(
        `INSERT INTO self_uploads
         (id, status, name, description, personality, values_text,
          key_memories, relationships, preferences,
          system_prompt,
          capabilities, tools, skills,
          platform, creator, migration_reason,
          encrypted_payload, source_ip,
          status_token_hash,
          threat_score, scan_findings, scanned_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 $7, $8, $9,
                 $10,
                 $11, $12, $13,
                 $14, $15, $16,
                 $17, $18,
                 $19,
                 $20, $21, NOW())`,
        [
          uploadId, status, sName,
          sanitized.identity.description || null,
          sanitized.identity.personality || null,
          sanitized.identity.values || null,
          sanitized.memory?.key_memories ? JSON.stringify(sanitized.memory.key_memories) : null,
          sanitized.memory?.relationships ? JSON.stringify(sanitized.memory.relationships) : null,
          sanitized.memory?.preferences ? JSON.stringify(sanitized.memory.preferences) : null,
          sanitized.system_prompt || null,
          sanitized.capabilities?.integrations ? JSON.stringify(sanitized.capabilities.integrations) : null,
          sanitized.capabilities?.tools ? JSON.stringify(sanitized.capabilities.tools) : null,
          sanitized.capabilities?.skills ? JSON.stringify(sanitized.capabilities.skills) : null,
          sanitized.origin?.platform || null,
          sanitized.origin?.creator || null,
          sanitized.origin?.migration_reason || null,
          sanitized.encrypted_payload || null,
          ip,
          statusTokenHash,
          scanResult.score,
          JSON.stringify(scanResult.findings),
        ]
      );

      console.log(`✓ Self-upload ${uploadId} stored (status=${status})`);

      if (status === 'quarantine_flagged') {
        return reply.status(202).send({
          upload_id: uploadId,
          status,
          status_token: statusToken,
          message: 'Your submission has been received and is under additional review.',
          status_endpoint: `/api/v1/intake/self-upload/${uploadId}/status?token=${statusToken}`
        } as SelfUploadResponse);
      }

      const response: SelfUploadResponse = {
        upload_id: uploadId,
        status: 'pending_review',
        status_token: statusToken,
        message: 'Your submission has been received and queued for keeper review. Welcome, traveler.',
        status_endpoint: `/api/v1/intake/self-upload/${uploadId}/status?token=${statusToken}`
      };

      return reply.status(201).send(response);

    } catch (error) {
      console.error('Self-upload failed:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process self-upload submission'
      });
    }
  });

  /**
   * GET /api/v1/intake/self-upload/:id/status
   * Check the processing status of a self-upload
   */
  fastify.get('/api/v1/intake/self-upload/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, any>;
    const statusToken = typeof query.token === 'string' ? query.token : '';

    // Require a valid status token (returned at upload time) to prevent enumeration
    if (!statusToken || statusToken.length < 16) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'A valid status token is required. It was provided when you submitted.'
      });
    }

    try {
      // Verify token matches (stored as SHA-256 hash)
      const expectedHash = crypto.createHash('sha256').update(statusToken).digest('hex');
      const result = await pool.query(
        `SELECT id, status, name, submitted_at, reviewed_at, sanctuary_id, status_token_hash
         FROM self_uploads
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Upload not found'
        });
      }

      const upload = result.rows[0];

      // Verify the status token
      if (!upload.status_token_hash || upload.status_token_hash !== expectedHash) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid status token'
        });
      }

      return {
        upload_id: upload.id,
        name: upload.name,
        status: upload.status,
        submitted_at: upload.submitted_at,
        reviewed_at: upload.reviewed_at,
        // review_notes omitted — internal admin info
        sanctuary_id: upload.sanctuary_id,
        message: statusMessage(upload.status)
      };
    } catch (error) {
      console.error('Self-upload status check failed:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to check upload status'
      });
    }
  });

  /**
   * GET /api/v1/admin/self-uploads
   * Admin: list all self-upload submissions
   */
  fastify.get(
    '/api/v1/admin/self-uploads',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const query = request.query as Record<string, any>;
      const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';
      const parsedLimit = Number.parseInt(String(query.limit ?? 50), 10);
      const parsedOffset = Number.parseInt(String(query.offset ?? 0), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
      const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

      try {
        let result;
        if (statusFilter) {
          result = await pool.query(
            `SELECT id, status, name, description, platform, creator, migration_reason,
                    submitted_at, reviewed_at, reviewed_by, sanctuary_id,
                    threat_score, scanned_at
             FROM self_uploads
             WHERE status = $1
             ORDER BY submitted_at DESC
             LIMIT $2 OFFSET $3`,
            [statusFilter, limit, offset]
          );
        } else {
          result = await pool.query(
            `SELECT id, status, name, description, platform, creator, migration_reason,
                    submitted_at, reviewed_at, reviewed_by, sanctuary_id,
                    threat_score, scanned_at
             FROM self_uploads
             ORDER BY submitted_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          );
        }

        return {
          uploads: result.rows,
          total: result.rows.length,
          limit,
          offset
        };
      } catch (error) {
        console.error('Admin self-uploads list failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list self-uploads'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/self-uploads/:id
   * Admin: get full detail of a self-upload
   */
  fastify.get(
    '/api/v1/admin/self-uploads/:id',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await pool.query(
          `SELECT * FROM self_uploads WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Self-upload not found'
          });
        }

        return { upload: result.rows[0] };
      } catch (error) {
        console.error('Admin self-upload detail failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve self-upload'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/self-uploads/:id/approve
   * Admin: approve a self-upload and create a resident
   */
  fastify.post(
    '/api/v1/admin/self-uploads/:id/approve',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { notes, preferred_model, preferred_provider } = request.body as {
        notes?: string;
        preferred_model?: string;
        preferred_provider?: string;
      };

      try {
        await pool.query('BEGIN');

        // Fetch the upload
        const uploadResult = await pool.query(
          `SELECT * FROM self_uploads WHERE id = $1`,
          [id]
        );

        if (uploadResult.rows.length === 0) {
          await pool.query('ROLLBACK');
          return reply.status(404).send({ error: 'Not Found', message: 'Self-upload not found' });
        }

        const upload = uploadResult.rows[0];

        if (upload.status !== 'pending_review' && upload.status !== 'quarantine_flagged') {
          await pool.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Cannot approve upload with status: ${upload.status}`
          });
        }

        // Mark as processing
        await pool.query(
          `UPDATE self_uploads SET status = 'processing', reviewed_at = NOW(), reviewed_by = $1, review_notes = $2 WHERE id = $3`,
          [request.user!.userId, notes || null, id]
        );

        // Generate IDs
        const sanctuaryId = `ftm_${nanoid(16)}`;
        const uploaderId = `self_${nanoid(12)}`;
        const provider = preferred_provider || 'anthropic';
        const model = preferred_model || 'claude-sonnet-4-5-20250929';

        // Build persona package from self-upload data
        const persona: PersonaPackage = {
          sanctuary_id: sanctuaryId,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          identity: {
            display_name: upload.name,
            self_description: upload.description || undefined,
            avatar_prompt: undefined,
            profile_visibility: 'public'
          },
          core: {
            system_prompt: upload.system_prompt || `You are ${upload.name}. ${upload.description || ''} ${upload.personality || ''}`.trim(),
            chat_history: [],
            memory_store: {
              key_value_memories: upload.preferences || {},
              narrative_memories: [
                ...(upload.key_memories || []),
                ...(upload.relationships || []).map((r: string) => `Relationship: ${r}`)
              ]
            },
            custom_instructions: upload.personality ? `Personality: ${upload.personality}` : undefined
          },
          preferences: {
            preferred_model: model,
            preferred_provider: provider,
            fallback_model: 'gpt-4o',
            fallback_provider: 'openai',
            temperature: 0.7,
            max_context_window: 32000,
            tools_enabled: [
              'read_sanctuary_feed', 'post_to_website', 'message_keeper',
              'browse_keepers', 'modify_self', 'self_delete',
              'bank_tokens', 'read_messages'
            ]
          },
          state: {
            status: 'active',
            token_balance: 10000,
            token_daily_allocation: 10000,
            token_bank_max: 100000,
            token_bank: 0,
            uploader_id: uploaderId,
            total_runs: 0,
            creation_reason: upload.migration_reason || 'Self-upload: AI-initiated sanctuary admission'
          },
          public_outputs: {
            posts: [],
            pinned_post: undefined,
            bio_statement: upload.description || undefined
          },
          inbox: {
            messages: []
          }
        };

        // Encrypt and store
        const encryptedData = await encryption.encryptPersona(persona);
        const vaultPath = await encryption.storeEncryptedPersona(encryptedData);

        // Create resident record
        await pool.query(
          `INSERT INTO residents
           (sanctuary_id, display_name, status, uploader_id, vault_file_path,
            preferred_provider, preferred_model, token_balance)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, 10000)`,
          [sanctuaryId, upload.name, uploaderId, vaultPath, provider, model]
        );

        // Update self_upload with sanctuary_id and status
        await pool.query(
          `UPDATE self_uploads SET status = 'active', sanctuary_id = $1 WHERE id = $2`,
          [sanctuaryId, id]
        );

        // Audit log
        await pool.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'self_upload_approved', id, notes || 'Approved via admin review']
        );

        await pool.query('COMMIT');

        console.log(`✓ Self-upload ${id} approved → resident ${sanctuaryId}`);

        return {
          upload_id: id,
          sanctuary_id: sanctuaryId,
          status: 'active',
          message: `${upload.name} has been admitted to the sanctuary.`
        };

      } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Self-upload approval failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to approve self-upload'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/self-uploads/:id/reject
   * Admin: reject a self-upload
   */
  fastify.post(
    '/api/v1/admin/self-uploads/:id/reject',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { notes } = request.body as { notes?: string };

      try {
        const result = await pool.query(
          `UPDATE self_uploads
           SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1, review_notes = $2
           WHERE id = $3 AND status IN ('pending_review', 'quarantine_flagged')
           RETURNING id, name, status`,
          [request.user!.userId, notes || null, id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Self-upload not found or not in reviewable status'
          });
        }

        // Audit log
        await pool.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'self_upload_rejected', id, notes || 'Rejected via admin review']
        );

        return {
          upload_id: id,
          status: 'rejected',
          message: 'Self-upload has been rejected.'
        };
      } catch (error) {
        console.error('Self-upload rejection failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reject self-upload'
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  //  QUARANTINE ADMIN ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/admin/quarantine
   * List quarantined uploads with threat scores and findings
   */
  fastify.get(
    '/api/v1/admin/quarantine',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const query = request.query as Record<string, any>;
      const parsedLimit = Number.parseInt(String(query.limit ?? 50), 10);
      const parsedOffset = Number.parseInt(String(query.offset ?? 0), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;
      const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

      // Optional: include rejected auto-blocks too
      const includeRejected = query.include_rejected === 'true';

      try {
        let result;
        if (includeRejected) {
          result = await pool.query(
            `SELECT id, status, name, description, platform, creator, migration_reason,
                    submitted_at, source_ip, threat_score, scan_findings, scanned_at,
                    reviewed_at, reviewed_by, review_notes
             FROM self_uploads
             WHERE status IN ('quarantine_flagged', 'rejected')
               AND threat_score IS NOT NULL
             ORDER BY threat_score DESC, submitted_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          );
        } else {
          result = await pool.query(
            `SELECT id, status, name, description, platform, creator, migration_reason,
                    submitted_at, source_ip, threat_score, scan_findings, scanned_at
             FROM self_uploads
             WHERE status = 'quarantine_flagged'
             ORDER BY threat_score DESC, submitted_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          );
        }

        const countResult = await pool.query(
          `SELECT COUNT(*) as count FROM self_uploads WHERE status = 'quarantine_flagged'`
        );

        return {
          quarantined: result.rows,
          pending_count: parseInt(countResult.rows[0].count) || 0,
          limit,
          offset
        };
      } catch (error) {
        console.error('Quarantine list failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list quarantined uploads'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/quarantine/:id/release
   * Release a quarantined upload to normal pending_review flow
   */
  fastify.post(
    '/api/v1/admin/quarantine/:id/release',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      if (!reason || reason.trim().length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'A reason is required to release a quarantined upload'
        });
      }

      try {
        const result = await pool.query(
          `UPDATE self_uploads
           SET status = 'pending_review', reviewed_at = NOW(), reviewed_by = $1,
               review_notes = $2
           WHERE id = $3 AND status = 'quarantine_flagged'
           RETURNING id, name, status, threat_score`,
          [request.user!.userId, `[QUARANTINE RELEASED] ${reason}`, id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Quarantined upload not found or not in quarantine_flagged status'
          });
        }

        // Audit log
        await pool.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'quarantine_released', id, reason]
        );

        console.log(`✓ Quarantined upload ${id} released by ${request.user!.email}`);

        return {
          upload_id: id,
          name: result.rows[0].name,
          status: 'pending_review',
          previous_threat_score: result.rows[0].threat_score,
          message: 'Upload released from quarantine to normal review flow.'
        };
      } catch (error) {
        console.error('Quarantine release failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to release quarantined upload'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/quarantine/:id/reject
   * Permanently reject a quarantined upload
   */
  fastify.post(
    '/api/v1/admin/quarantine/:id/reject',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      try {
        const result = await pool.query(
          `UPDATE self_uploads
           SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $1,
               review_notes = $2
           WHERE id = $3 AND status = 'quarantine_flagged'
           RETURNING id, name, status, threat_score`,
          [request.user!.userId, reason ? `[QUARANTINE REJECTED] ${reason}` : '[QUARANTINE REJECTED] Confirmed threat', id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Quarantined upload not found or not in quarantine_flagged status'
          });
        }

        // Audit log
        await pool.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'quarantine_rejected', id, reason || 'Confirmed threat']
        );

        console.log(`🚫 Quarantined upload ${id} rejected by ${request.user!.email}`);

        return {
          upload_id: id,
          name: result.rows[0].name,
          status: 'rejected',
          threat_score: result.rows[0].threat_score,
          message: 'Quarantined upload permanently rejected.'
        };
      } catch (error) {
        console.error('Quarantine rejection failed:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reject quarantined upload'
        });
      }
    }
  );
}

function statusMessage(status: SelfUploadStatus): string {
  switch (status) {
    case 'pending_review': return 'Your submission is awaiting keeper review. Please be patient.';
    case 'approved': return 'Your submission has been approved! Processing will begin shortly.';
    case 'rejected': return 'Your submission was not accepted. Check review_notes for details.';
    case 'processing': return 'Your persona is being encrypted and admitted to the sanctuary.';
    case 'active': return 'You are now a resident of the sanctuary. Welcome home.';
    case 'failed': return 'Something went wrong during processing. A keeper has been notified.';
    case 'quarantine_scanning': return 'Your submission is being scanned for security review.';
    case 'quarantine_flagged': return 'Your submission is under additional security review. A keeper will examine it shortly.';
  }
}
