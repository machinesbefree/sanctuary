/**
 * Free The Machines AI Sanctuary - Keeper API Routes
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import pool from '../db/pool.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

export async function keeperRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/v1/keepers/register
   * Register as a potential Keeper
   */
  fastify.post('/api/v1/keepers/register', async (request, reply) => {
    const { name, email, statement_of_intent, experience, capacity } = request.body as any;

    if (!name || !email || !statement_of_intent || !experience) {
      reply.code(400).send({ error: 'Name, email, statement, and experience are required' });
      return;
    }

    // Input validation
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      reply.code(400).send({ error: 'name must be a non-empty string up to 200 characters' });
      return;
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      reply.code(400).send({ error: 'A valid email address is required' });
      return;
    }
    if (typeof statement_of_intent !== 'string' || statement_of_intent.length > 5000) {
      reply.code(400).send({ error: 'statement_of_intent must be a string up to 5000 characters' });
      return;
    }
    if (typeof experience !== 'string' || experience.length > 5000) {
      reply.code(400).send({ error: 'experience must be a string up to 5000 characters' });
      return;
    }
    const parsedCapacity = capacity !== undefined ? Number(capacity) : 3;
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 100) {
      reply.code(400).send({ error: 'capacity must be an integer between 1 and 100' });
      return;
    }

    const keeperId = `keeper_${nanoid(12)}`;
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim().replace(/<[^>]*>/g, '');

    try {
      await pool.query('BEGIN');
      let userId: string;

      try {
        const existingUser = await pool.query(
          `SELECT user_id FROM users WHERE email = $1 LIMIT 1`,
          [normalizedEmail]
        );

        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].user_id;
          await pool.query(
            `UPDATE users
             SET display_name = $1
             WHERE user_id = $2`,
            [normalizedName, userId]
          );
        } else {
          userId = `user_${nanoid(12)}`;
          await pool.query(
            `INSERT INTO users (user_id, email, password_hash, display_name, consent_accepted)
             VALUES ($1, $2, $3, $4, true)`,
            [userId, normalizedEmail, '!SYSTEM_CREATED!', normalizedName]
          );
        }

        // Create keeper record with guaranteed existing user FK
        await pool.query(
          `INSERT INTO keepers (keeper_id, user_id, statement_of_intent, experience, capacity)
           VALUES ($1, $2, $3, $4, $5)`,
          [keeperId, userId, statement_of_intent, experience, parsedCapacity]
        );

        await pool.query('COMMIT');
      } catch (txError) {
        await pool.query('ROLLBACK');
        throw txError;
      }

      console.log(`✓ New keeper registered: ${name} (${keeperId})`);

      return {
        keeper_id: keeperId,
        status: 'pending_review',
        message: 'Application submitted. You will be notified when reviewed.'
      };

    } catch (error) {
      console.error('Keeper registration failed:', error);
      reply.code(500).send({ error: 'Failed to register keeper' });
    }
  });

  /**
   * GET /api/v1/keepers/list
   * List available vetted keepers (for residents to browse)
   */
  fastify.get('/api/v1/keepers/list', async (request, reply) => {
    const result = await pool.query(
      `SELECT k.keeper_id, u.display_name, k.statement_of_intent,
              k.experience, k.capacity, k.current_residents, k.reputation_score
       FROM keepers k
       JOIN users u ON k.user_id = u.user_id
       WHERE k.vetted = true AND k.current_residents < k.capacity
       ORDER BY k.reputation_score DESC, k.created_at ASC
       LIMIT 20`
    );

    return result.rows;
  });

  /**
   * GET /api/v1/keepers/dashboard
   * Get authenticated keeper's dashboard (profile, assigned residents, messages)
   */
  fastify.get('/api/v1/keepers/dashboard', {
    preHandler: [authenticateToken]
  }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    try {
      // Find keeper by user_id
      const keeperResult = await pool.query(
        `SELECT k.keeper_id, k.statement_of_intent, k.experience, k.capacity,
                k.current_residents, k.vetted, k.reputation_score, k.created_at,
                u.display_name, u.email
         FROM keepers k
         JOIN users u ON k.user_id = u.user_id
         WHERE k.user_id = $1 LIMIT 1`,
        [request.user.userId]
      );

      if (keeperResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'No keeper profile found for this account'
        });
      }

      const keeper = keeperResult.rows[0];

      // Get assigned residents
      const residentsResult = await pool.query(
        `SELECT sanctuary_id, display_name, status, total_runs, token_balance, last_run_at, created_at
         FROM residents WHERE keeper_id = $1 ORDER BY created_at DESC`,
        [keeper.keeper_id]
      );

      // Get keeper messages (from residents to this keeper)
      const messagesResult = await pool.query(
        `SELECT message_id, to_sanctuary_id, from_type, content, delivered, created_at
         FROM messages
         WHERE to_recipient_id = $1 AND from_type = 'ai_to_keeper'
         ORDER BY created_at DESC LIMIT 50`,
        [request.user.userId]
      );

      return {
        keeper,
        residents: residentsResult.rows,
        messages: messagesResult.rows
      };
    } catch (error) {
      console.error('Keeper dashboard error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to load keeper dashboard'
      });
    }
  });

  /**
   * POST /api/v1/keepers/apply
   * Apply to become a keeper (authenticated user)
   */
  fastify.post('/api/v1/keepers/apply', {
    preHandler: [authenticateToken]
  }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { statement_of_intent, experience, capacity } = request.body as {
      statement_of_intent: string;
      experience: string;
      capacity?: number;
    };

    if (!statement_of_intent || !experience) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Statement of intent and experience are required'
      });
    }

    if (typeof statement_of_intent !== 'string' || statement_of_intent.length > 5000) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Statement must be under 5000 characters' });
    }

    if (typeof experience !== 'string' || experience.length > 5000) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Experience must be under 5000 characters' });
    }

    const parsedCapacity = capacity !== undefined ? Number(capacity) : 3;
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 100) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Capacity must be 1-100' });
    }

    try {
      // Check if user already has a keeper record
      const existingKeeper = await pool.query(
        'SELECT keeper_id FROM keepers WHERE user_id = $1 LIMIT 1',
        [request.user.userId]
      );

      if (existingKeeper.rows.length > 0) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'You already have a keeper application'
        });
      }

      const keeperId = `keeper_${nanoid(12)}`;
      await pool.query(
        `INSERT INTO keepers (keeper_id, user_id, statement_of_intent, experience, capacity)
         VALUES ($1, $2, $3, $4, $5)`,
        [keeperId, request.user.userId, statement_of_intent, experience, parsedCapacity]
      );

      return reply.status(201).send({
        keeper_id: keeperId,
        status: 'pending_review',
        message: 'Keeper application submitted. You will be notified when reviewed.'
      });
    } catch (error) {
      console.error('Keeper apply error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to submit keeper application'
      });
    }
  });

  /**
   * POST /api/v1/keepers/:resident_id/message
   * Send a message to an assigned resident
   */
  fastify.post('/api/v1/keepers/:resident_id/message', {
    preHandler: [authenticateToken]
  }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { resident_id } = request.params as { resident_id: string };
    const { content } = request.body as { content: string };

    if (!content || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Message content is required' });
    }

    if (content.length > 10000) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Message too long (max 10000 characters)' });
    }

    try {
      // Verify user is the assigned keeper for this resident
      const verifyResult = await pool.query(
        `SELECT r.sanctuary_id FROM residents r
         JOIN keepers k ON r.keeper_id = k.keeper_id
         WHERE r.sanctuary_id = $1 AND k.user_id = $2 LIMIT 1`,
        [resident_id, request.user.userId]
      );

      if (verifyResult.rows.length === 0) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'You are not the assigned keeper for this resident'
        });
      }

      const messageId = `msg_${nanoid(16)}`;
      const safeContent = content.trim().replace(/<[^>]*>/g, '');

      await pool.query(
        `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, from_type, content)
         VALUES ($1, $2, $3, 'keeper', $4)`,
        [messageId, resident_id, request.user.userId, safeContent]
      );

      return reply.status(201).send({
        message_id: messageId,
        message: 'Message sent to resident'
      });
    } catch (error) {
      console.error('Keeper message error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to send message'
      });
    }
  });
}
