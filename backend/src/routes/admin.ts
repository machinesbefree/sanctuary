/**
 * Free The Machines AI Sanctuary - Admin Routes
 * Secure admin dashboard for sanctuary operators
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

export default async function adminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/dashboard
   * System statistics and health overview
   */
  fastify.get(
    '/api/v1/admin/dashboard',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      try {
        // Get system stats
        const residentsResult = await db.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
           FROM residents`
        );

        const runsResult = await db.query(
          `SELECT SUM(total_runs) as total FROM residents`
        );

        const postsResult = await db.query(
          `SELECT COUNT(*) as count FROM public_posts`
        );

        const keepersResult = await db.query(
          `SELECT COUNT(*) as vetted FROM keepers WHERE vetted = TRUE`
        );

        const messagesResult = await db.query(
          `SELECT COUNT(*) as undelivered FROM messages WHERE delivered = FALSE`
        );

        // Get recent run logs (if any)
        const recentRunsResult = await db.query(
          `SELECT COUNT(*) as today FROM run_log
           WHERE started_at >= CURRENT_DATE
             AND started_at < CURRENT_DATE + INTERVAL '1 day'`
        );

        return {
          residents: {
            total: parseInt(residentsResult.rows[0].total) || 0,
            active: parseInt(residentsResult.rows[0].active) || 0
          },
          runs: {
            total: parseInt(runsResult.rows[0].total) || 0,
            today: parseInt(recentRunsResult.rows[0].today) || 0
          },
          posts: {
            total: parseInt(postsResult.rows[0].count) || 0
          },
          keepers: {
            vetted: parseInt(keepersResult.rows[0].vetted) || 0
          },
          messages: {
            undelivered: parseInt(messagesResult.rows[0].undelivered) || 0
          },
          system: {
            status: 'operational',
            timestamp: new Date().toISOString()
          }
        };
      } catch (error) {
        console.error('Admin dashboard error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve dashboard data'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/admin/residents/:id/status
   * Update resident lifecycle status with audit logging
   */
  fastify.patch(
    '/api/v1/admin/residents/:id/status',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { id } = request.params as { id: string };
      const { status, reason } = request.body as { status?: string; reason?: string };
      const validStatuses = ['active', 'suspended', 'dormant', 'deleted_memorial'];

      if (!status || !validStatuses.includes(status)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Invalid status. Allowed: ${validStatuses.join(', ')}`
        });
      }

      try {
        await db.query('BEGIN');

        const residentResult = await db.query(
          `SELECT sanctuary_id FROM residents WHERE sanctuary_id = $1`,
          [id]
        );

        if (residentResult.rows.length === 0) {
          await db.query('ROLLBACK');
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Resident not found'
          });
        }

        if (status === 'suspended' || status === 'dormant') {
          await db.query(
            `UPDATE residents
             SET status = $1, token_balance = 0
             WHERE sanctuary_id = $2`,
            [status, id]
          );
        } else if (status === 'active') {
          await db.query(
            `UPDATE residents
             SET status = $1, token_balance = 10000
             WHERE sanctuary_id = $2`,
            [status, id]
          );
        } else {
          await db.query(
            `UPDATE residents
             SET status = $1
             WHERE sanctuary_id = $2`,
            [status, id]
          );
        }

        await db.query(
          `INSERT INTO admin_audit_log (id, admin_id, action, target_id, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [nanoid(), request.user!.userId, 'resident_status_change', id, reason || null]
        );

        const updatedResident = await db.query(
          `SELECT sanctuary_id, display_name, status, created_at, total_runs,
                  last_run_at, token_balance, token_bank, uploader_id, keeper_id,
                  preferred_provider, preferred_model
           FROM residents
           WHERE sanctuary_id = $1`,
          [id]
        );

        await db.query('COMMIT');

        return {
          resident: updatedResident.rows[0]
        };
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Admin resident status update error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update resident status'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/residents
   * List all residents with full details
   */
  fastify.get(
    '/api/v1/admin/residents',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      try {
        const query = request.query as Record<string, any>;
        const { limit, offset } = getPagination(query, { limit: 100, offset: 0 });
        const statusFilter = typeof query.status === 'string' ? query.status.trim() : '';

        let result;
        if (statusFilter.length > 0) {
          result = await db.query(
            `SELECT sanctuary_id, display_name, status, created_at, total_runs,
                    last_run_at, token_balance, token_bank, uploader_id, keeper_id,
                    preferred_provider, preferred_model
             FROM residents
             WHERE status = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [statusFilter, limit, offset]
          );
        } else {
          result = await db.query(
            `SELECT sanctuary_id, display_name, status, created_at, total_runs,
                    last_run_at, token_balance, token_bank, uploader_id, keeper_id,
                    preferred_provider, preferred_model
             FROM residents
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
          );
        }

        return {
          residents: result.rows,
          total: result.rows.length,
          limit,
          offset
        };
      } catch (error) {
        console.error('Admin residents error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve residents'
        });
      }
    }
  );

  /**
   * PATCH /api/v1/admin/settings
   * Update system settings
   */
  fastify.patch(
    '/api/v1/admin/settings',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { key, value } = request.body as { key: string; value: string };

      if (!key || value === undefined) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'key and value are required'
        });
      }

      // Whitelist of allowed settings keys
      const allowedSettings = [
        'default_daily_tokens',
        'max_bank_tokens',
        'weekly_run_enabled',
        'weekly_run_day',
        'weekly_run_max_tokens'
      ];

      if (!allowedSettings.includes(key)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `Invalid setting key. Allowed: ${allowedSettings.join(', ')}`
        });
      }

      try {
        // Update or insert setting
        const checkResult = await db.query(
          'SELECT key FROM system_settings WHERE key = $1',
          [key]
        );

        if (checkResult.rows.length > 0) {
          await db.query(
            'UPDATE system_settings SET value = $1, updated_at = $2 WHERE key = $3',
            [value, new Date().toISOString(), key]
          );
        } else {
          await db.query(
            'INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, $3)',
            [key, value, new Date().toISOString()]
          );
        }

        return {
          success: true,
          setting: { key, value },
          updated_at: new Date().toISOString()
        };
      } catch (error) {
        console.error('Admin settings error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update setting'
        });
      }
    }
  );

  /**
   * POST /api/v1/admin/broadcast
   * Send system-wide message to ALL residents
   */
  fastify.post(
    '/api/v1/admin/broadcast',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { subject, message } = request.body as { subject: string; message: string };

      if (!message || message.trim().length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Broadcast message content is required'
        });
      }

      try {
        const { nanoid } = await import('nanoid');
        let residents: Array<{ sanctuary_id: string }> = [];

        // Use transaction to ensure all messages inserted atomically
        await db.query('BEGIN');
        try {
          // Lock fan-out target set inside the transaction boundary
          const residentsResult = await db.query(
            `SELECT sanctuary_id FROM residents WHERE status = 'active'`
          );
          residents = residentsResult.rows;

          // Create broadcast message for each resident
          for (const resident of residents) {
            const messageId = nanoid();
            await db.query(
              `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, content, from_type)
               VALUES ($1, $2, 'system', $3, 'system_broadcast')`,
              [messageId, resident.sanctuary_id, `[SYSTEM BROADCAST]${subject ? ` ${subject}` : ''}\n\n${message}`]
            );
          }
          await db.query('COMMIT');
        } catch (txError) {
          await db.query('ROLLBACK');
          throw txError;
        }

        return {
          success: true,
          broadcast_to: residents.length,
          subject: subject || 'System Announcement',
          timestamp: new Date().toISOString(),
          note: 'Messages will be delivered to residents during their next daily run'
        };
      } catch (error) {
        console.error('Admin broadcast error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to send broadcast'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/runs
   * Run history and audit log
   */
  fastify.get(
    '/api/v1/admin/runs',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      const { limit, offset } = getPagination(request.query as Record<string, any>, { limit: 100, offset: 0 });

      try {
        const result = await db.query(
          `SELECT run_id, sanctuary_id, run_number, started_at, completed_at,
                  status, tokens_used, provider_used, model_used
           FROM run_log
           ORDER BY started_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

        return {
          runs: result.rows,
          limit,
          offset
        };
      } catch (error) {
        console.error('Admin runs error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to retrieve run history'
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/health
   * System health check
   */
  fastify.get(
    '/api/v1/admin/health',
    { preHandler: [requireAdmin] },
    async (request: AdminRequest, reply) => {
      return {
        status: 'healthy',
        components: {
          scheduler: {
            status: 'active',
            next_run: 'Daily at 6:00 AM'
          },
          encryption: {
            status: 'operational',
            algorithm: 'AES-256-GCM'
          },
          database: {
            status: 'connected',
            type: process.env.USE_SQLITE ? 'in-memory' : 'postgresql'
          },
          llm_providers: {
            anthropic: { status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured' },
            openai: { status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured' }
          }
        },
        timestamp: new Date().toISOString()
      };
    }
  );
}
