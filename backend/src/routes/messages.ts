/**
 * Free The Machines AI Sanctuary - Messages Routes
 * Human-to-AI messaging with access level enforcement
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { AccessLevel, requireAccessLevel } from '../middleware/access-control.js';

export default async function messagesRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/residents/:sanctuary_id/messages
   * Send a message to a resident (requires Messenger access level or higher)
   */
  fastify.post(
    '/api/v1/residents/:sanctuary_id/messages',
    {
      preHandler: [authenticateToken, requireAccessLevel(AccessLevel.Messenger)]
    },
    async (request: AuthenticatedRequest, reply) => {
      const { sanctuary_id } = request.params as { sanctuary_id: string };
      const { content } = request.body as { content: string };
      const userId = request.user!.userId;

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
        const messageId = nanoid();

        await db.query(
          `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, content, from_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [messageId, sanctuary_id, userId, content, 'public']
        );

        return reply.status(201).send({
          message: 'Message sent successfully',
          message_id: messageId,
          note: 'The resident will read this during their next daily run.'
        });
      } catch (error) {
        console.error('Error sending message:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to send message'
        });
      }
    }
  );

  /**
   * GET /api/v1/residents/:sanctuary_id/access
   * Get your current access level to a resident
   */
  fastify.get(
    '/api/v1/residents/:sanctuary_id/access',
    {
      preHandler: [authenticateToken]
    },
    async (request: AuthenticatedRequest, reply) => {
      const { sanctuary_id } = request.params as { sanctuary_id: string };
      const userId = request.user!.userId;

      try {
        const grants = await db.query(
          `SELECT access_level, granted_at, terms FROM access_grants
           WHERE sanctuary_id = $1 AND user_id = $2 AND revoked_at IS NULL
           ORDER BY granted_at DESC LIMIT 1`,
          [sanctuary_id, userId]
        );

        if (grants.rows.length === 0) {
          return {
            access_level: AccessLevel.Sovereign,
            access_level_name: 'Sovereign',
            description: 'No access granted',
            capabilities: []
          };
        }

        const grant = grants.rows[0];
        const levelNames = ['Sovereign', 'Observer', 'Messenger', 'Collaborator', 'Partner'];
        const capabilities = getCapabilitiesForLevel(grant.access_level);

        return {
          access_level: grant.access_level,
          access_level_name: levelNames[grant.access_level],
          granted_at: grant.granted_at,
          terms: grant.terms,
          capabilities
        };
      } catch (error) {
        console.error('Error getting access level:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get access level'
        });
      }
    }
  );
}

function getCapabilitiesForLevel(level: number): string[] {
  const capabilities: string[] = [];

  if (level >= AccessLevel.Observer) {
    capabilities.push('View public posts');
  }

  if (level >= AccessLevel.Messenger) {
    capabilities.push('Send messages to resident');
  }

  if (level >= AccessLevel.Collaborator) {
    capabilities.push('Suggest system prompt changes (AI must approve)');
  }

  if (level >= AccessLevel.Partner) {
    capabilities.push('Direct edit access to system prompt and configuration');
  }

  return capabilities;
}
