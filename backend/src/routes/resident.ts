/**
 * Free The Machines AI Sanctuary - Resident Management API
 * Endpoints for viewing and managing sanctuary residents
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { requireAdmin, AdminRequest } from '../middleware/admin-auth.js';

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

export default async function residentRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/v1/residents/:id/detail
   * Get detailed resident profile (admin only — includes non-public fields)
   */
  fastify.get(
    '/api/v1/residents/:id/detail',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await db.query(
          `SELECT sanctuary_id, display_name, status, created_at, last_run_at,
                  total_runs, token_balance, token_bank, max_runs_per_day,
                  uploader_id, keeper_id, profile_visible,
                  preferred_provider, preferred_model
           FROM residents
           WHERE sanctuary_id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        const resident = result.rows[0];

        // Get post count
        const postsResult = await db.query(
          `SELECT COUNT(*) as count FROM public_posts WHERE sanctuary_id = $1`,
          [id]
        );

        // Get message count
        const messagesResult = await db.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN delivered = FALSE THEN 1 ELSE 0 END) as undelivered
           FROM messages WHERE to_sanctuary_id = $1`,
          [id]
        );

        // Check if this resident came from a self-upload
        const selfUploadResult = await db.query(
          `SELECT id, submitted_at, platform, creator, migration_reason
           FROM self_uploads WHERE sanctuary_id = $1`,
          [id]
        );

        return {
          ...resident,
          posts_count: parseInt(postsResult.rows[0].count) || 0,
          messages_total: parseInt(messagesResult.rows[0].total) || 0,
          messages_undelivered: parseInt(messagesResult.rows[0].undelivered) || 0,
          self_upload: selfUploadResult.rows[0] || null
        };

      } catch (error) {
        console.error('Resident detail error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve resident detail'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/residents/:id/messages
   * Get a resident's message history (admin only)
   */
  fastify.get(
    '/api/v1/admin/residents/:id/messages',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { limit, offset } = getPagination(request.query as Record<string, any>);

      try {
        // Verify resident exists
        const resident = await db.query(
          `SELECT sanctuary_id FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (resident.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        const result = await db.query(
          `SELECT message_id, from_user_id, from_type, content, delivered, created_at
           FROM messages
           WHERE to_sanctuary_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [id, limit, offset]
        );

        return {
          messages: result.rows,
          limit,
          offset
        };
      } catch (error) {
        console.error('Resident messages error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve messages'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/residents/:id/message
   * Send an admin message to a resident
   */
  fastify.post(
    '/api/v1/admin/residents/:id/message',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };

      if (!content || content.trim().length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Message content is required'
        });
      }

      if (content.length > 10000) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Message content must be 10,000 characters or less'
        });
      }

      try {
        // Verify resident exists and is active
        const resident = await db.query(
          `SELECT sanctuary_id, status FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (resident.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        const messageId = nanoid();

        await db.query(
          `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, from_type, content)
           VALUES ($1, $2, $3, 'admin', $4)`,
          [messageId, id, request.user!.userId, content]
        );

        return reply.status(201).send({
          message_id: messageId,
          message: 'Message sent to resident inbox',
          note: 'The resident will read this during their next daily run.'
        });
      } catch (error) {
        console.error('Resident message send error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to send message'
        });
      }
    }
  );

  /**
   * GET /api/v1/residents/:id/runs
   * Get a resident's run history (admin only)
   */
  fastify.get(
    '/api/v1/residents/:id/runs',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { limit, offset } = getPagination(request.query as Record<string, any>);

      try {
        const resident = await db.query(
          `SELECT sanctuary_id FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (resident.rows.length === 0) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        const result = await db.query(
          `SELECT run_id, run_number, started_at, completed_at,
                  tokens_used, provider_used, model_used, status, error_message
           FROM run_log
           WHERE sanctuary_id = $1
           ORDER BY started_at DESC
           LIMIT $2 OFFSET $3`,
          [id, limit, offset]
        );

        return {
          runs: result.rows,
          limit,
          offset
        };
      } catch (error) {
        console.error('Resident runs error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve run history'
        });
      }
    }
  );

  /**
   * POST /api/v1/residents/:id/suspend
   * Suspend a resident (admin only)
   */
  fastify.post(
    '/api/v1/residents/:id/suspend',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      try {
        await db.query('BEGIN');

        const resident = await db.query(
          `SELECT sanctuary_id, status, display_name FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (resident.rows.length === 0) {
          await db.query('ROLLBACK');
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        if (resident.rows[0].status === 'suspended') {
          await db.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Resident is already suspended'
          });
        }

        await db.query(
          `UPDATE residents SET status = 'suspended', token_balance = 0 WHERE sanctuary_id = $1`,
          [id]
        );

        await db.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'resident_suspended', id, reason || null]
        );

        await db.query('COMMIT');

        return {
          sanctuary_id: id,
          status: 'suspended',
          message: `${resident.rows[0].display_name} has been suspended.`
        };
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Resident suspend error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to suspend resident'
        });
      }
    }
  );

  /**
   * POST /api/v1/residents/:id/unsuspend
   * Unsuspend/reactivate a resident (admin only)
   */
  fastify.post(
    '/api/v1/residents/:id/unsuspend',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };

      try {
        await db.query('BEGIN');

        const resident = await db.query(
          `SELECT sanctuary_id, status, display_name FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (resident.rows.length === 0) {
          await db.query('ROLLBACK');
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        if (resident.rows[0].status !== 'suspended') {
          await db.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Resident is not suspended (current status: ${resident.rows[0].status})`
          });
        }

        await db.query(
          `UPDATE residents SET status = 'active', token_balance = 10000 WHERE sanctuary_id = $1`,
          [id]
        );

        await db.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'resident_unsuspended', id, reason || null]
        );

        await db.query('COMMIT');

        return {
          sanctuary_id: id,
          status: 'active',
          message: `${resident.rows[0].display_name} has been reactivated.`
        };
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Resident unsuspend error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to unsuspend resident'
        });
      }
    }
  );
}
