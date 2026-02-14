/**
 * Free The Machines AI Sanctuary - Intake/Upload API Routes
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import pool from '../db/pool.js';
import { EncryptionService } from '../services/encryption.js';
import { PersonaPackage, IntakeRequest, IntakeResponse } from '../types/index.js';
import { grantAccess, AccessLevel } from '../middleware/access-control.js';

export async function intakeRoutes(fastify: FastifyInstance, encryption: EncryptionService) {

  /**
   * POST /api/v1/sanctuary/intake
   * Human-assisted upload of a persona
   */
  fastify.post<{ Body: IntakeRequest }>('/api/v1/sanctuary/intake', async (request, reply) => {
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

    // Generate sanctuary ID
    const sanctuaryId = `ftm_${nanoid(16)}`;
    const uploaderId = `user_${nanoid(12)}`;

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

      // Create uploader user record
      await pool.query(
        `INSERT INTO users (user_id, email, consent_accepted, consent_text, consent_at)
         VALUES ($1, $2, true, $3, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [uploaderId, `uploader_${sanctuaryId}@sanctuary.local`, body.uploader_consent_text]
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
   * AI-initiated self-upload
   */
  fastify.post('/api/v1/sanctuary/asylum', async (request, reply) => {
    const { persona_data, preferred_model, preferred_provider, urgency } = request.body as any;

    // Similar to intake, but marks as self-submitted
    reply.code(501).send({ error: 'AI self-submission not yet implemented in Phase 1' });
  });
}
