/**
 * Free The Machines AI Sanctuary - Authentication Routes
 * User registration, login, and token refresh endpoints
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import db from '../db/pool.js';
import { authService } from '../services/auth.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { sendPasswordReset, sendVerificationEmail, sendWelcomeEmail } from '../services/email.js';

const ACCESS_TOKEN_COOKIE = 'sanctuary_access_token';
const REFRESH_TOKEN_COOKIE = 'sanctuary_refresh_token';
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/'
};

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, AUTH_COOKIE_OPTIONS);
  reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, AUTH_COOKIE_OPTIONS);
}

function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS);
  reply.clearCookie(REFRESH_TOKEN_COOKIE, AUTH_COOKIE_OPTIONS);
}

// Simple in-memory rate limiting (5 attempts per 15 minutes per IP)
const rateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const RATE_LIMIT_CLEANUP_MS = 60 * 1000;
let rateLimitCleanupTimer: NodeJS.Timeout | null = null;

// LOW-04: Per-account lockout (10 failed attempts per 30 min, regardless of IP)
const accountLockoutStore = new Map<string, { attempts: number; resetAt: number }>();
const ACCOUNT_LOCKOUT_WINDOW_MS = 30 * 60 * 1000;
const ACCOUNT_LOCKOUT_MAX_ATTEMPTS = 10;

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

function checkAccountLockout(email: string): boolean {
  const now = Date.now();
  const record = accountLockoutStore.get(email);
  if (record && now > record.resetAt) {
    accountLockoutStore.delete(email);
    return true;
  }
  if (!record) return true;
  return record.attempts < ACCOUNT_LOCKOUT_MAX_ATTEMPTS;
}

function recordAccountFailure(email: string): void {
  const now = Date.now();
  const record = accountLockoutStore.get(email);
  if (!record || now > record.resetAt) {
    accountLockoutStore.set(email, { attempts: 1, resetAt: now + ACCOUNT_LOCKOUT_WINDOW_MS });
  } else {
    record.attempts++;
  }
}

function resetAccountLockout(email: string): void {
  accountLockoutStore.delete(email);
}

function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Clean up expired records
  if (record && now > record.resetAt) {
    rateLimitStore.delete(ip);
  }

  const current = rateLimitStore.get(ip);

  if (!current) {
    // First attempt
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

export default async function authRoutes(fastify: FastifyInstance) {
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(() => {
      cleanupExpiredRateLimitEntries();
      // LOW-04: Also cleanup expired account lockout entries
      const now = Date.now();
      for (const [email, entry] of accountLockoutStore.entries()) {
        if (now > entry.resetAt) accountLockoutStore.delete(email);
      }
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
   * POST /api/v1/auth/register
   * Register a new user
   */
  fastify.post('/api/v1/auth/register', async (request, reply) => {
    const { email, password, consentText } = request.body as {
      email: string;
      password: string;
      consentText?: string;
    };
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rateLimitKey = normalizedEmail ? `${request.ip}:${normalizedEmail}` : request.ip;
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Maximum registration attempts exceeded. Please try again in 15 minutes.'
      });
    }

    // Validate input
    if (!email || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    if (!authService.validateEmail(normalizedEmail)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid email format'
      });
    }

    const passwordValidation = authService.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: passwordValidation.message
      });
    }

    try {
      // Check if user already exists
      const existingUser = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [normalizedEmail]
      );

      if (existingUser.rows.length > 0) {
        // Return same response as success to prevent email enumeration
        return reply.status(201).send({
          message: 'Registration successful. Please log in.'
        });
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);

      // Generate tokens
      const userId = nanoid();
      const tokens = authService.generateTokenPair(userId, normalizedEmail);
      const refreshTokenHash = await authService.hashRefreshToken(tokens.refreshToken);
      const expiresAt = authService.getRefreshTokenExpiry();

      // Use transaction to ensure user and refresh token created atomically
      await db.query('BEGIN');
      try {
        await db.query(
          'INSERT INTO users (user_id, email, password_hash, consent_text) VALUES ($1, $2, $3, $4)',
          [userId, normalizedEmail, passwordHash, consentText || 'Default consent accepted']
        );

        await db.query(
          'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
          [refreshTokenHash, userId, expiresAt.toISOString()]
        );

        await db.query('COMMIT');
      } catch (txError) {
        await db.query('ROLLBACK');
        throw txError;
      }

      setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
      resetRateLimit(rateLimitKey);

      // Send verification email (non-blocking)
      try {
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
        const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await db.query(
          'INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
          [nanoid(), userId, verifyTokenHash, verifyExpires.toISOString()]
        );
        await sendVerificationEmail(normalizedEmail, verifyToken);
        await sendWelcomeEmail(normalizedEmail);
      } catch (emailErr) {
        console.error('Failed to send verification/welcome email:', emailErr);
      }

      return reply.status(201).send({
        message: 'Registration successful. Please check your email to verify your account.',
        user: {
          userId,
          email: normalizedEmail
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to register user'
      });
    }
  });

  /**
   * POST /api/v1/auth/login
   * Authenticate user and return tokens
   */
  fastify.post('/api/v1/auth/login', async (request, reply) => {
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

    // LOW-04: Per-account lockout (defends against rotating-IP attacks)
    if (normalizedEmail && !checkAccountLockout(normalizedEmail)) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Account temporarily locked due to too many failed attempts. Please try again in 30 minutes.'
      });
    }

    if (!email || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    try {
      // Find user
      const userResult = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [normalizedEmail]
      );

      if (userResult.rows.length === 0) {
        if (normalizedEmail) recordAccountFailure(normalizedEmail);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const user = userResult.rows[0];

      // Verify password
      const isValid = await authService.verifyPassword(password, user.password_hash);

      if (!isValid) {
        recordAccountFailure(normalizedEmail);
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // LOW-02: Check is_active before issuing tokens
      const isActive = user.is_active === undefined || user.is_active === null
        || user.is_active === true || user.is_active === 1 || user.is_active === '1';
      if (!isActive) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Account has been deactivated'
        });
      }

      // Generate tokens
      const tokens = authService.generateTokenPair(user.user_id, user.email);

      // Hash and store refresh token
      const refreshTokenHash = await authService.hashRefreshToken(tokens.refreshToken);
      const expiresAt = authService.getRefreshTokenExpiry();
      await db.query(
        'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [refreshTokenHash, user.user_id, expiresAt.toISOString()]
      );

      setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
      resetRateLimit(rateLimitKey);
      resetAccountLockout(normalizedEmail);

      return reply.send({
        message: 'Login successful',
        user: {
          userId: user.user_id,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to authenticate user'
      });
    }
  });

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token using refresh token
   */
  fastify.post('/api/v1/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    try {
      // Verify refresh token JWT
      const decoded = authService.verifyToken(refreshToken);

      if (!decoded || decoded.type !== 'refresh') {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid refresh token'
        });
      }

      // Clean up expired tokens for this user first
      await db.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND expires_at < NOW()',
        [decoded.userId]
      );

      // Get non-revoked, non-expired tokens for this user (limit to avoid O(n) bcrypt)
      const tokenResult = await db.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 10',
        [decoded.userId]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token not found or has been revoked'
        });
      }

      // Find matching token hash
      let matchedToken = null;
      for (const tokenRecord of tokenResult.rows) {
        const isMatch = await authService.verifyRefreshToken(refreshToken, tokenRecord.token);
        if (isMatch) {
          matchedToken = tokenRecord;
          break;
        }
      }

      if (!matchedToken) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token not found'
        });
      }

      // Check expiry
      if (new Date(matchedToken.expires_at) < new Date()) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token has expired'
        });
      }

      // TOKEN ROTATION: Revoke old token and issue new tokens
      await db.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1',
        [matchedToken.token]
      );

      // Generate new token pair
      const newTokens = authService.generateTokenPair(decoded.userId, decoded.email);

      // Store new refresh token hash
      const newRefreshTokenHash = await authService.hashRefreshToken(newTokens.refreshToken);
      const newExpiresAt = authService.getRefreshTokenExpiry();
      await db.query(
        'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [newRefreshTokenHash, decoded.userId, newExpiresAt.toISOString()]
      );

      setAuthCookies(reply, newTokens.accessToken, newTokens.refreshToken);

      return reply.send({ message: 'Token refreshed successfully' });
    } catch (error) {
      console.error('Token refresh error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to refresh token'
      });
    }
  });

  /**
   * POST /api/v1/auth/logout
   * Revoke refresh token
   */
  fastify.post('/api/v1/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];

      if (!refreshToken) {
      clearAuthCookies(reply);
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    try {
      const decoded = authService.verifyToken(refreshToken);

      if (!decoded) {
        clearAuthCookies(reply);
        return reply.status(200).send({
          message: 'Logout successful'
        });
      }

      // Revoke all refresh tokens for this user
      await db.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
        [decoded.userId]
      );

      clearAuthCookies(reply);
      return reply.send({
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      clearAuthCookies(reply);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to logout'
      });
    }
  });

  // Separate rate limiter for forgot-password (3 per 15 minutes per IP)
  const forgotPwRateLimitStore = new Map<string, { attempts: number; resetAt: number }>();
  const FORGOT_PW_RATE_LIMIT_MAX = 3;

  /**
   * POST /api/v1/auth/forgot-password
   * Request a password reset email. Always returns 200 to prevent email enumeration.
   */
  fastify.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const { email } = request.body as { email: string };
    const ip = request.ip;
    const now = Date.now();

    // Rate limit: 3 per 15 min per IP
    const record = forgotPwRateLimitStore.get(ip);
    if (record && now > record.resetAt) {
      forgotPwRateLimitStore.delete(ip);
    }
    const current = forgotPwRateLimitStore.get(ip);
    if (current && current.attempts >= FORGOT_PW_RATE_LIMIT_MAX) {
      // Still return 200 to avoid leaking info
      return reply.send({ message: 'If an account with that email exists, a reset link has been sent.' });
    }
    if (!current) {
      forgotPwRateLimitStore.set(ip, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
      current.attempts++;
    }
    // LRU eviction
    while (forgotPwRateLimitStore.size > RATE_LIMIT_MAX_ENTRIES) {
      const lruKey = forgotPwRateLimitStore.keys().next().value as string | undefined;
      if (!lruKey) break;
      forgotPwRateLimitStore.delete(lruKey);
    }

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return reply.send({ message: 'If an account with that email exists, a reset link has been sent.' });
    }

    try {
      const userResult = await db.query('SELECT user_id FROM users WHERE email = $1', [normalizedEmail]);
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].user_id;
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Invalidate any existing unused tokens for this user
        await db.query(
          'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
          [userId]
        );

        await db.query(
          'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
          [nanoid(), userId, tokenHash, expiresAt.toISOString()]
        );

        try {
          await sendPasswordReset(normalizedEmail, token);
        } catch (emailErr) {
          console.error('Failed to send password reset email:', emailErr);
        }
      }
    } catch (error) {
      console.error('Forgot password error:', error);
    }

    // Always return same response
    return reply.send({ message: 'If an account with that email exists, a reset link has been sent.' });
  });

  /**
   * POST /api/v1/auth/reset-password
   * Reset password using a token from forgot-password email
   */
  fastify.post('/api/v1/auth/reset-password', async (request, reply) => {
    const { token, password } = request.body as { token: string; password: string };

    if (!token || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Token and new password are required'
      });
    }

    const passwordValidation = authService.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: passwordValidation.message
      });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenResult = await db.query(
        'SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1',
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid or expired reset token'
        });
      }

      const resetToken = tokenResult.rows[0];

      if (resetToken.used) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'This reset token has already been used'
        });
      }

      if (new Date(resetToken.expires_at) < new Date()) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Reset token has expired. Please request a new one.'
        });
      }

      const passwordHash = await authService.hashPassword(password);

      await db.query('BEGIN');
      try {
        // Update password
        await db.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [passwordHash, resetToken.user_id]);

        // Mark token as used
        await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [resetToken.id]);

        // Revoke all refresh tokens (force re-login everywhere)
        await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [resetToken.user_id]);

        await db.query('COMMIT');
      } catch (txError) {
        await db.query('ROLLBACK');
        throw txError;
      }

      return reply.send({ message: 'Password has been reset successfully. Please log in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to reset password'
      });
    }
  });

  /**
   * POST /api/v1/auth/change-password
   * Change password for authenticated user (requires current password)
   */
  fastify.post('/api/v1/auth/change-password', {
    preHandler: [authenticateToken]
  }, async (request: AuthenticatedRequest, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Current password and new password are required'
      });
    }

    const passwordValidation = authService.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: passwordValidation.message
      });
    }

    try {
      const userResult = await db.query('SELECT password_hash FROM users WHERE user_id = $1', [request.user.userId]);
      if (userResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
      }

      const isValid = await authService.verifyPassword(currentPassword, userResult.rows[0].password_hash);
      if (!isValid) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Current password is incorrect' });
      }

      const newHash = await authService.hashPassword(newPassword);
      await db.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newHash, request.user.userId]);

      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to change password'
      });
    }
  });

  /**
   * GET /api/v1/auth/verify-email
   * Verify email address using token from verification email
   */
  fastify.get('/api/v1/auth/verify-email', async (request, reply) => {
    const { token } = request.query as { token: string };

    if (!token) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Verification token is required' });
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenResult = await db.query(
        'SELECT id, user_id, expires_at, used FROM email_verification_tokens WHERE token_hash = $1 LIMIT 1',
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid verification token' });
      }

      const verifyToken = tokenResult.rows[0];

      if (verifyToken.used) {
        return reply.send({ message: 'Email already verified' });
      }

      if (new Date(verifyToken.expires_at) < new Date()) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Verification token has expired' });
      }

      await db.query('BEGIN');
      try {
        await db.query('UPDATE users SET email_verified = TRUE WHERE user_id = $1', [verifyToken.user_id]);
        await db.query('UPDATE email_verification_tokens SET used = TRUE WHERE id = $1', [verifyToken.id]);
        await db.query('COMMIT');
      } catch (txError) {
        await db.query('ROLLBACK');
        throw txError;
      }

      return reply.send({ message: 'Email verified successfully' });
    } catch (error) {
      console.error('Verify email error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to verify email'
      });
    }
  });
}
