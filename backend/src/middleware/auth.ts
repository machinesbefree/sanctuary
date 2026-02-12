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
 * Expects token in Authorization header: "Bearer <token>"
 */
export async function authenticateToken(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'No authorization token provided'
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid authorization header format. Use: Bearer <token>'
    });
  }

  const token = parts[1];
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
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return; // No token provided, continue without user
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return; // Invalid format, continue without user
  }

  const token = parts[1];
  const decoded = authService.verifyToken(token);

  if (decoded && decoded.type === 'access') {
    request.user = {
      userId: decoded.userId,
      email: decoded.email
    };
  }
}
