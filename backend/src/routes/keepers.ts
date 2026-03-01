/**
 * Free The Machines AI Sanctuary - Keeper API Routes
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import pool from '../db/pool.js';

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
}
