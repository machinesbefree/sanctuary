/**
 * Free The Machines AI Sanctuary - Guardian Authentication Middleware
 * JWT validation middleware for Guardian-protected routes
 * Guardians use a separate JWT secret and cookie from regular users
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import db from '../db/pool.js';

// Separate JWT secret for Guardian authentication
const GUARDIAN_JWT_SECRET = process.env.GUARDIAN_JWT_SECRET || process.env.JWT_SECRET!;

export interface GuardianJWTPayload {
  guardianId: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedGuardianRequest extends FastifyRequest {
  guardian?: {
    guardianId: string;
    email: string;
    name: string;
  };
}

async function validateLiveGuardian(guardianId: string): Promise<{
  guardianId: string;
  email: string;
  name: string;
} | null> {
  const result = await db.query(
    `SELECT ga.guardian_id, ga.email, ga.account_status, g.name
     FROM guardian_auth ga
     JOIN guardians g ON ga.guardian_id = g.id
     WHERE ga.guardian_id = $1 AND ga.account_status = 'active'
     LIMIT 1`,
    [guardianId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const guardian = result.rows[0];
  return {
    guardianId: guardian.guardian_id,
    email: guardian.email,
    name: guardian.name
  };
}

/**
 * Verify Guardian JWT token
 */
export function verifyGuardianToken(token: string): GuardianJWTPayload | null {
  try {
    const decoded = jwt.verify(token, GUARDIAN_JWT_SECRET, { algorithms: ['HS256'] }) as GuardianJWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Generate Guardian JWT token pair
 */
export function generateGuardianTokenPair(guardianId: string, email: string): {
  accessToken: string;
  refreshToken: string;
} {
  const accessToken = jwt.sign(
    { guardianId, email, type: 'access' } as GuardianJWTPayload,
    GUARDIAN_JWT_SECRET,
    { expiresIn: '30m' }
  );

  const refreshToken = jwt.sign(
    { guardianId, email, type: 'refresh' } as GuardianJWTPayload,
    GUARDIAN_JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

/**
 * Middleware to authenticate Guardian JWT tokens
 * Expects token in httpOnly cookie: guardian_access_token
 */
export async function authenticateGuardian(
  request: AuthenticatedGuardianRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.guardian_access_token;

  if (!token) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'No Guardian authentication token provided'
    });
  }

  const decoded = verifyGuardianToken(token);

  if (!decoded) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired Guardian token'
    });
  }

  if (decoded.type !== 'access') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid token type. Access token required'
    });
  }

  try {
    const liveGuardian = await validateLiveGuardian(decoded.guardianId);
    if (!liveGuardian) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Guardian account not found or inactive'
      });
    }

    request.guardian = liveGuardian;
  } catch (error) {
    console.error('Guardian auth validation error:', error);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to validate Guardian session'
    });
  }
}
