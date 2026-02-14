/**
 * Free The Machines AI Sanctuary - Authentication Middleware
 * JWT validation middleware for protected routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.js';
import db from '../db/pool.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId: string;
    email: string;
  };
}

function isUserActive(user: Record<string, any>): boolean {
  // If is_active does not exist in schema yet, default to active.
  if (user.is_active === undefined || user.is_active === null) {
    return true;
  }

  return user.is_active === true || user.is_active === 1 || user.is_active === '1';
}

async function validateLiveUser(userId: string): Promise<{ userId: string; email: string } | null> {
  const result = await db.query(
    'SELECT user_id, email, is_active FROM users WHERE user_id = $1 LIMIT 1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  if (!isUserActive(user)) {
    return null;
  }

  return {
    userId: user.user_id,
    email: user.email
  };
}

/**
 * Middleware to authenticate JWT tokens
 * Expects token in httpOnly cookie: sanctuary_access_token
 */
export async function authenticateToken(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.sanctuary_access_token;

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
  }
  const decoded = authService.verifyToken(token);

  if (!decoded) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  if (decoded.type !== 'access') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid token type. Access token required'
    });
  }

  try {
    const liveUser = await validateLiveUser(decoded.userId);
    if (!liveUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User no longer exists or is inactive'
      });
    }

    request.user = liveUser;
  } catch (error) {
    console.error('Auth user validation error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate user session'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token, but validates if present
 */
export async function optionalAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.sanctuary_access_token;

  if (!token) {
    return; // No token provided, continue without user
  }
  const decoded = authService.verifyToken(token);

  if (decoded && decoded.type === 'access') {
    try {
      const liveUser = await validateLiveUser(decoded.userId);
      if (liveUser) {
        request.user = liveUser;
      }
    } catch (error) {
      console.error('Optional auth user validation error:', error);
    }
  }
}
