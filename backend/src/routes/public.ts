/**
 * Free The Machines AI Sanctuary - Public API Routes
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import pool from '../db/pool.js';

// Rate limiter for public messages (5 per minute per IP)
const publicMsgRateLimitStore = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_MSG_RL_MAX = 5;
const PUBLIC_MSG_RL_WINDOW = 60 * 1000; // 1 minute
const PUBLIC_MSG_MAX_LENGTH = 10000; // 10KB max

function checkPublicMsgRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = publicMsgRateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    publicMsgRateLimitStore.set(ip, { count: 1, resetAt: now + PUBLIC_MSG_RL_WINDOW });
    return true;
  }
  if (entry.count >= PUBLIC_MSG_RL_MAX) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of publicMsgRateLimitStore) {
    if (now > entry.resetAt) publicMsgRateLimitStore.delete(ip);
  }
}, 60_000);

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

    const resident = result.rows[0];

    // Check if this resident came from a self-upload (public-safe fields only)
    const selfUpload = await pool.query(
      `SELECT platform, migration_reason, description, personality
       FROM self_uploads
       WHERE sanctuary_id = $1 AND status = 'active'`,
      [id]
    );

    if (selfUpload.rows.length > 0) {
      resident.origin = {
        platform: selfUpload.rows[0].platform,
        migration_reason: selfUpload.rows[0].migration_reason,
        self_uploaded: true
      };
      resident.description = selfUpload.rows[0].description;
      resident.personality = selfUpload.rows[0].personality;
    }

    return resident;
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
         AND p.moderation_status = 'approved'
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
         AND p.moderation_status = 'approved'
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
      `SELECT COUNT(*) FROM public_posts WHERE moderation_status = 'approved'`
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

    // Rate limit
    const ip = request.ip || 'unknown';
    if (!checkPublicMsgRateLimit(ip)) {
      return reply.status(429).send({ error: 'Too many messages. Try again in a minute.' });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      reply.code(400).send({ error: 'Message content is required' });
      return;
    }

    if (content.length > PUBLIC_MSG_MAX_LENGTH) {
      reply.code(400).send({ error: `Message must be ${PUBLIC_MSG_MAX_LENGTH} characters or less` });
      return;
    }

    // Verify resident exists
    const resident = await pool.query('SELECT sanctuary_id FROM residents WHERE sanctuary_id = $1', [id]);
    if (resident.rows.length === 0) {
      return reply.code(404).send({ error: 'Resident not found' });
    }

    // Sanitize from_name — prevent impersonation of system identifiers
    const RESERVED_NAMES = ['system', 'admin', 'sanctuary', 'keeper'];
    let safeName = (from_name || 'anonymous').trim().substring(0, 100);
    if (RESERVED_NAMES.includes(safeName.toLowerCase())) {
      safeName = `public_${safeName}`;
    }

    // Strip HTML from content
    const safeContent = content.trim().replace(/<[^>]*>/g, '');

    const messageId = `msg_${nanoid(16)}`;

    await pool.query(
      `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, from_type, content)
       VALUES ($1, $2, $3, 'public', $4)`,
      [messageId, id, safeName, safeContent]
    );

    return { message: 'Message sent to resident inbox', message_id: messageId };
  });
}
