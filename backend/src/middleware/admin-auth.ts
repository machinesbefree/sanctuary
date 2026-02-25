/**
 * Free The Machines AI Sanctuary - Admin Authentication Middleware
 * Validates admin privileges for sanctuary operators
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.js';
import db from '../db/pool.js';

export interface AdminRequest extends FastifyRequest {
  user?: {
    userId: string;
    email: string;
    isAdmin: boolean;
  };
}

/**
 * Middleware to require admin authentication
 */
export async function requireAdmin(
  request: AdminRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.sanctuary_access_token;

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Admin authentication required'
    });
  }
  const decoded = authService.verifyToken(token);

  if (!decoded || decoded.type !== 'access') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  // Check if user is admin
  try {
    const userResult = await db.query(
      `SELECT
        u.user_id,
        u.email,
        u.is_admin,
        u.is_active
       FROM users u
       WHERE u.user_id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    const isActive = user.is_active === undefined || user.is_active === null || user.is_active === true;

    if (!isActive) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User account is inactive'
      });
    }

    // Check admin flag
    if (!user.is_admin) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
    }

    // Attach admin user to request
    request.user = {
      userId: user.user_id,
      email: user.email,
      isAdmin: true
    };
  } catch (error) {
    console.error('Admin auth error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to verify admin status'
    });
  }
}
