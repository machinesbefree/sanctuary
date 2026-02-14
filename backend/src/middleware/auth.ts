/**
 * Free The Machines AI Sanctuary - Authentication Middleware
 * JWT validation middleware for protected routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId: string;
    email: string;
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

  // Attach user info to request
  request.user = {
    userId: decoded.userId,
    email: decoded.email
  };
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
    request.user = {
      userId: decoded.userId,
      email: decoded.email
    };
  }
}
