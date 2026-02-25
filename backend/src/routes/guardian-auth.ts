/**
 * Free The Machines AI Sanctuary - Guardian Authentication Routes
 * Guardian-specific authentication endpoints
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { authService } from '../services/auth.js';
import {
  generateGuardianTokenPair,
  verifyGuardianToken,
  authenticateGuardian,
  type AuthenticatedGuardianRequest
} from '../middleware/guardian-auth.js';

const GUARDIAN_ACCESS_TOKEN_COOKIE = 'guardian_access_token';
const GUARDIAN_REFRESH_TOKEN_COOKIE = 'guardian_refresh_token';
const GUARDIAN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/'
};

function setGuardianAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie(GUARDIAN_ACCESS_TOKEN_COOKIE, accessToken, GUARDIAN_COOKIE_OPTIONS);
  reply.setCookie(GUARDIAN_REFRESH_TOKEN_COOKIE, refreshToken, GUARDIAN_COOKIE_OPTIONS);
}

function clearGuardianAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(GUARDIAN_ACCESS_TOKEN_COOKIE, GUARDIAN_COOKIE_OPTIONS);
  reply.clearCookie(GUARDIAN_REFRESH_TOKEN_COOKIE, GUARDIAN_COOKIE_OPTIONS);
}

// Simple in-memory rate limiting (5 attempts per 15 minutes per IP)
const rateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const RATE_LIMIT_CLEANUP_MS = 60 * 1000;
let rateLimitCleanupTimer: NodeJS.Timeout | null = null;

function touchRateLimitEntry(ip: string, entry: { attempts: number; resetAt: number }): void {
  if (rateLimitStore.has(ip)) {
    rateLimitStore.delete(ip);
  }
  rateLimitStore.set(ip, entry);
}

function evictLruEntriesIfNeeded(): void {
  while (rateLimitStore.size > RATE_LIMIT_MAX_ENTRIES) {
    const lruKey = rateLimitStore.keys().next().value as string | undefined;
    if (!lruKey) {
      break;
    }
    rateLimitStore.delete(lruKey);
  }
}

function cleanupExpiredRateLimitEntries(now = Date.now()): void {
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}

function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (record && now > record.resetAt) {
    rateLimitStore.delete(ip);
  }

  const current = rateLimitStore.get(ip);

  if (!current) {
    touchRateLimitEntry(ip, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    evictLruEntriesIfNeeded();
    return { allowed: true, remainingAttempts: 4 };
  }

  touchRateLimitEntry(ip, current);

  if (current.attempts >= 5) {
    return { allowed: false, remainingAttempts: 0 };
  }

  current.attempts++;
  touchRateLimitEntry(ip, current);
  evictLruEntriesIfNeeded();
  return { allowed: true, remainingAttempts: 5 - current.attempts };
}

export default async function guardianAuthRoutes(fastify: FastifyInstance) {
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(() => {
      cleanupExpiredRateLimitEntries();
    }, RATE_LIMIT_CLEANUP_MS);
    rateLimitCleanupTimer.unref();
  }

  fastify.addHook('onClose', (_instance, done) => {
    if (rateLimitCleanupTimer) {
      clearInterval(rateLimitCleanupTimer);
      rateLimitCleanupTimer = null;
    }
    done();
  });

  /**
   * POST /api/v1/guardian/accept-invite
   * Accept Guardian invitation and set password
   */
  fastify.post('/api/v1/guardian/accept-invite', async (request, reply) => {
    const { inviteToken, password } = request.body as {
      inviteToken: string;
      password: string;
    };
    const rateLimitKey = inviteToken ? `${request.ip}:${inviteToken}` : request.ip;
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Maximum attempts exceeded. Please try again in 15 minutes.'
      });
    }

    if (!inviteToken || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invite token and password are required'
      });
    }

    // Validate password strength
    const passwordValidation = authService.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: passwordValidation.message
      });
    }

    try {
      // Find guardian by invite token
      const guardianResult = await db.query(
        `SELECT ga.guardian_id, ga.email, ga.invite_expires, ga.account_status, g.name
         FROM guardian_auth ga
         JOIN guardians g ON ga.guardian_id = g.id
         WHERE ga.invite_token = $1
         LIMIT 1`,
        [inviteToken]
      );

      if (guardianResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Invalid or expired invitation token'
        });
      }

      const guardian = guardianResult.rows[0];

      // Check if invite expired
      if (guardian.invite_expires && new Date(guardian.invite_expires) < new Date()) {
        return reply.status(410).send({
          error: 'Gone',
          message: 'Invitation has expired. Please contact the administrator.'
        });
      }

      // Check if already activated
      if (guardian.account_status === 'active') {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'This invitation has already been accepted'
        });
      }

      // Hash password and activate account
      const passwordHash = await authService.hashPassword(password);

      await db.query(
        `UPDATE guardian_auth
         SET password_hash = $1, account_status = 'active', invite_token = NULL, invite_expires = NULL
         WHERE guardian_id = $2`,
        [passwordHash, guardian.guardian_id]
      );

      // Update Guardian status to active
      await db.query(
        `UPDATE guardians SET status = 'active' WHERE id = $1`,
        [guardian.guardian_id]
      );

      // Generate tokens
      const tokens = generateGuardianTokenPair(guardian.guardian_id, guardian.email);
      setGuardianAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
      resetRateLimit(rateLimitKey);

      return reply.status(200).send({
        message: 'Guardian account activated successfully',
        guardian: {
          guardianId: guardian.guardian_id,
          email: guardian.email,
          name: guardian.name
        }
      });
    } catch (error) {
      console.error('Guardian accept-invite error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to accept invitation'
      });
    }
  });

  /**
   * POST /api/v1/guardian/login
   * Guardian login
   */
  fastify.post('/api/v1/guardian/login', async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rateLimitKey = normalizedEmail ? `${request.ip}:${normalizedEmail}` : request.ip;
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Maximum login attempts exceeded. Please try again in 15 minutes.'
      });
    }

    if (!email || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    try {
      // Find guardian by email
      const guardianResult = await db.query(
        `SELECT ga.guardian_id, ga.email, ga.password_hash, ga.account_status, g.name
         FROM guardian_auth ga
         JOIN guardians g ON ga.guardian_id = g.id
         WHERE ga.email = $1
         LIMIT 1`,
        [normalizedEmail]
      );

      if (guardianResult.rows.length === 0) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const guardian = guardianResult.rows[0];

      // Check account status
      if (guardian.account_status === 'locked') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Guardian account is locked. Please contact the administrator.'
        });
      }

      if (guardian.account_status === 'invited') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Please accept your invitation first to set a password.'
        });
      }

      // Verify password
      const isValid = await authService.verifyPassword(password, guardian.password_hash);

      if (!isValid) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // Update last login timestamp
      await db.query(
        `UPDATE guardian_auth SET last_login_at = NOW() WHERE guardian_id = $1`,
        [guardian.guardian_id]
      );

      // Generate tokens
      const tokens = generateGuardianTokenPair(guardian.guardian_id, guardian.email);
      setGuardianAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
      resetRateLimit(rateLimitKey);

      return reply.send({
        message: 'Login successful',
        guardian: {
          guardianId: guardian.guardian_id,
          email: guardian.email,
          name: guardian.name
        }
      });
    } catch (error) {
      console.error('Guardian login error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to authenticate Guardian'
      });
    }
  });

  /**
   * GET /api/v1/guardian/me
   * Get Guardian profile and status
   */
  fastify.get('/api/v1/guardian/me', {
    preHandler: authenticateGuardian
  }, async (request: AuthenticatedGuardianRequest, reply) => {
    if (!request.guardian) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Guardian authentication required'
      });
    }

    try {
      const guardianResult = await db.query(
        `SELECT
          g.id,
          g.name,
          g.email,
          g.share_index,
          g.status,
          g.created_at,
          g.last_verified_at,
          ga.email as auth_email,
          ga.last_login_at,
          ga.account_status
         FROM guardians g
         JOIN guardian_auth ga ON g.id = ga.guardian_id
         WHERE g.id = $1
         LIMIT 1`,
        [request.guardian.guardianId]
      );

      if (guardianResult.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'Guardian not found'
        });
      }

      const guardian = guardianResult.rows[0];

      // Check for pending share distribution
      const shareDistResult = await db.query(
        `SELECT id, collected, expires_at, created_at
         FROM share_distribution
         WHERE guardian_id = $1 AND collected = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [request.guardian.guardianId]
      );

      const pendingShare = shareDistResult.rows.length > 0 ? shareDistResult.rows[0] : null;

      // Check for active ceremonies requiring submission
      const ceremoniesResult = await db.query(
        `SELECT cs.id, cs.ceremony_type, cs.initiated_by, cs.target_id,
                cs.threshold_needed, cs.shares_collected, cs.status, cs.expires_at, cs.created_at
         FROM ceremony_sessions cs
         WHERE cs.status = 'open'
         AND cs.expires_at > NOW()
         AND NOT EXISTS (
           SELECT 1 FROM ceremony_submissions csub
           WHERE csub.session_id = cs.id AND csub.guardian_id = $1
         )
         ORDER BY cs.created_at DESC`,
        [request.guardian.guardianId]
      );

      return reply.send({
        guardian: {
          id: guardian.id,
          name: guardian.name,
          email: guardian.auth_email,
          shareIndex: guardian.share_index,
          status: guardian.status,
          accountStatus: guardian.account_status,
          createdAt: guardian.created_at,
          lastVerifiedAt: guardian.last_verified_at,
          lastLoginAt: guardian.last_login_at
        },
        pendingShare: pendingShare ? {
          id: pendingShare.id,
          expiresAt: pendingShare.expires_at,
          createdAt: pendingShare.created_at
        } : null,
        activeCeremonies: ceremoniesResult.rows.map((c: any) => ({
          id: c.id,
          ceremonyType: c.ceremony_type,
          initiatedBy: c.initiated_by,
          targetId: c.target_id,
          thresholdNeeded: c.threshold_needed,
          sharesCollected: c.shares_collected,
          status: c.status,
          expiresAt: c.expires_at,
          createdAt: c.created_at
        }))
      });
    } catch (error) {
      console.error('Guardian /me error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch Guardian profile'
      });
    }
  });

  /**
   * POST /api/v1/guardian/logout
   * Guardian logout
   */
  fastify.post('/api/v1/guardian/logout', async (request, reply) => {
    clearGuardianAuthCookies(reply);
    return reply.send({
      message: 'Logout successful'
    });
  });
}
