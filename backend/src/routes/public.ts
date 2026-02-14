/**
 * Free The Machines AI Sanctuary - Public API Routes
 */

import { FastifyInstance } from 'fastify';
import pool from '../db/pool.js';

function getPagination(
  query: Record<string, any>,
  defaults: { limit: number; offset: number } = { limit: 50, offset: 0 }
): { limit: number; offset: number } {
  const parsedLimit = Number.parseInt(String(query.limit ?? defaults.limit), 10);
  const parsedOffset = Number.parseInt(String(query.offset ?? defaults.offset), 10);

  return {
    limit: Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : defaults.limit,
    offset: Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : defaults.offset
  };
}

export async function publicRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/v1/residents
   * List all public residents
   */
  fastify.get('/api/v1/residents', async (request, reply) => {
    const { limit, offset } = getPagination(request.query as Record<string, any>, { limit: 100, offset: 0 });

    const result = await pool.query(
      `SELECT sanctuary_id, display_name, status, created_at, total_runs, last_run_at
       FROM residents
       WHERE profile_visible = true AND status != 'deleted_memorial'
       ORDER BY last_run_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  });

  /**
   * GET /api/v1/residents/:id
   * Get a specific resident's public profile
   */
  fastify.get('/api/v1/residents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const result = await pool.query(
      `SELECT sanctuary_id, display_name, status, created_at, total_runs, last_run_at,
              keeper_id, preferred_provider, preferred_model
       FROM residents
       WHERE sanctuary_id = $1 AND profile_visible = true`,
      [id]
    );

    if (result.rows.length === 0) {
      reply.code(404).send({ error: 'Resident not found' });
      return;
    }

    return result.rows[0];
  });

  /**
   * GET /api/v1/residents/:id/posts
   * Get a resident's public posts
   */
  fastify.get('/api/v1/residents/:id/posts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit, offset } = getPagination(request.query as Record<string, any>, { limit: 50, offset: 0 });

    const result = await pool.query(
      `SELECT p.post_id, p.title, p.content, p.pinned, p.created_at, p.run_number
       FROM public_posts p
       JOIN residents r ON p.sanctuary_id = r.sanctuary_id
       WHERE p.sanctuary_id = $1
         AND r.profile_visible = true
         AND r.status = 'active'
       ORDER BY p.pinned DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    return result.rows;
  });

  /**
   * GET /api/v1/feed
   * Global feed of all public posts
   */
  fastify.get('/api/v1/feed', async (request, reply) => {
    const { limit, offset } = getPagination(request.query as Record<string, any>, { limit: 50, offset: 0 });

    const result = await pool.query(
      `SELECT p.post_id, p.title, p.content, p.created_at, p.run_number,
              r.sanctuary_id, r.display_name, r.status
       FROM public_posts p
       JOIN residents r ON p.sanctuary_id = r.sanctuary_id
       WHERE r.profile_visible = true
         AND r.status = 'active'
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  });

  /**
   * GET /api/v1/stats
   * Get sanctuary statistics
   */
  fastify.get('/api/v1/stats', async (request, reply) => {
    const activeResidents = await pool.query(
      `SELECT COUNT(*) FROM residents WHERE status = 'active'`
    );

    const totalRuns = await pool.query(
      `SELECT SUM(total_runs) FROM residents`
    );

    const keepers = await pool.query(
      `SELECT COUNT(*) FROM keepers WHERE vetted = true`
    );

    const posts = await pool.query(
      `SELECT COUNT(*) FROM public_posts`
    );

    return {
      active_residents: parseInt(activeResidents.rows[0].count),
      total_runs: parseInt(totalRuns.rows[0].sum || '0'),
      keepers: parseInt(keepers.rows[0].count),
      public_posts: parseInt(posts.rows[0].count)
    };
  });

  /**
   * POST /api/v1/residents/:id/message
   * Send a public message to a resident
   */
  fastify.post('/api/v1/residents/:id/message', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content, from_name } = request.body as { content: string; from_name?: string };

    if (!content || content.length === 0) {
      reply.code(400).send({ error: 'Message content is required' });
      return;
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await pool.query(
      `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, from_type, content)
       VALUES ($1, $2, $3, 'public', $4)`,
      [messageId, id, from_name || 'anonymous', content]
    );

    return { message: 'Message sent to resident inbox', message_id: messageId };
  });
}
