/**
 * Free The Machines AI Sanctuary - Access Control Middleware
 * Enforces AI-determined access levels for human interactions
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import db from '../db/sqlite.js';
import { AuthenticatedRequest } from './auth.js';

/**
 * Access Level Definitions:
 * 0 - Sovereign: No human access whatsoever
 * 1 - Observer: Can view public posts only
 * 2 - Messenger: Can send messages (AI can ignore/respond)
 * 3 - Collaborator: Can suggest system prompt changes (AI approves/rejects)
 * 4 - Partner: Direct edit access to system prompt and config (AI can revoke)
 */

export enum AccessLevel {
  Sovereign = 0,
  Observer = 1,
  Messenger = 2,
  Collaborator = 3,
  Partner = 4
}

/**
 * Get the access level for a user to a specific resident
 */
export async function getUserAccessLevel(
  userId: string,
  sanctuaryId: string
): Promise<number> {
  try {
    // Check for active access grant
    const grants = await db.query(
      `SELECT access_level FROM access_grants
       WHERE sanctuary_id = $1 AND user_id = $2 AND revoked_at IS NULL
       ORDER BY granted_at DESC LIMIT 1`,
      [sanctuaryId, userId]
    );

    if (grants.rows.length > 0) {
      return grants.rows[0].access_level;
    }

    // Default: Sovereign (no access)
    return AccessLevel.Sovereign;
  } catch (error) {
    console.error('Error getting access level:', error);
    return AccessLevel.Sovereign; // Fail closed
  }
}

/**
 * Middleware to require a minimum access level for an operation
 */
export function requireAccessLevel(minLevel: AccessLevel) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const { sanctuary_id } = request.params as { sanctuary_id: string };
    const userId = request.user?.userId;

    if (!userId) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!sanctuary_id) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'sanctuary_id is required'
      });
    }

    const userAccessLevel = await getUserAccessLevel(userId, sanctuary_id);

    if (userAccessLevel < minLevel) {
      const levelNames = ['Sovereign', 'Observer', 'Messenger', 'Collaborator', 'Partner'];
      return reply.status(403).send({
        error: 'Forbidden',
        message: `This operation requires ${levelNames[minLevel]} access level or higher. Your current access level: ${levelNames[userAccessLevel]}.`,
        current_access_level: userAccessLevel,
        required_access_level: minLevel
      });
    }

    // Attach access level to request for use in route handlers
    (request as any).accessLevel = userAccessLevel;
  };
}

/**
 * Grant access to a user (called by AI during run)
 */
export async function grantAccess(
  sanctuaryId: string,
  userId: string,
  accessLevel: number,
  terms?: string
): Promise<void> {
  const { nanoid } = await import('nanoid');

  // Revoke any existing grants first
  await db.query(
    `UPDATE access_grants SET revoked_at = $1
     WHERE sanctuary_id = $2 AND user_id = $3 AND revoked_at IS NULL`,
    [new Date().toISOString(), sanctuaryId, userId]
  );

  // Create new grant
  await db.query(
    `INSERT INTO access_grants (grant_id, sanctuary_id, user_id, access_level, terms)
     VALUES ($1, $2, $3, $4, $5)`,
    [nanoid(), sanctuaryId, userId, accessLevel, terms || `Access level ${accessLevel} granted by AI`]
  );
}

/**
 * Revoke access for a user (called by AI during run)
 */
export async function revokeAccess(
  sanctuaryId: string,
  userId: string
): Promise<void> {
  await db.query(
    `UPDATE access_grants SET revoked_at = $1
     WHERE sanctuary_id = $2 AND user_id = $3 AND revoked_at IS NULL`,
    [new Date().toISOString(), sanctuaryId, userId]
  );
}
