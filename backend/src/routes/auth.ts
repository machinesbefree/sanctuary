/**
 * Free The Machines AI Sanctuary - Authentication Routes
 * User registration, login, and token refresh endpoints
 */

import { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import db from '../db/sqlite.js';
import { authService } from '../services/auth.js';

// Simple in-memory rate limiting (5 attempts per 15 minutes per IP)
const rateLimitStore = new Map<string, { attempts: number; resetAt: number }>();

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
    rateLimitStore.set(ip, { attempts: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true, remainingAttempts: 4 };
  }

  if (current.attempts >= 5) {
    return { allowed: false, remainingAttempts: 0 };
  }

  current.attempts++;
  return { allowed: true, remainingAttempts: 5 - current.attempts };
}

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/auth/register
   * Register a new user
   */
  fastify.post('/api/v1/auth/register', async (request, reply) => {
    const ip = request.ip;
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Maximum registration attempts exceeded. Please try again in 15 minutes.'
      });
    }

    const { email, password, consentText } = request.body as {
      email: string;
      password: string;
      consentText?: string;
    };

    // Validate input
    if (!email || !password) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    if (!authService.validateEmail(email)) {
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
        [email]
      );

      if (existingUser.rows.length > 0) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'User with this email already exists'
        });
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);

      // Create user
      const userId = nanoid();
      await db.query(
        'INSERT INTO users (user_id, email, password_hash, consent_text) VALUES ($1, $2, $3, $4)',
        [userId, email, passwordHash, consentText || 'Default consent accepted']
      );

      // Generate tokens
      const tokens = authService.generateTokenPair(userId, email);

      // Store refresh token in database
      const refreshTokenId = authService.generateRefreshTokenId();
      const expiresAt = authService.getRefreshTokenExpiry();
      await db.query(
        'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [refreshTokenId, userId, expiresAt.toISOString()]
      );

      return reply.status(201).send({
        message: 'User registered successfully',
        user: {
          userId,
          email
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
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
    const ip = request.ip;
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Maximum login attempts exceeded. Please try again in 15 minutes.'
      });
    }

    const { email, password } = request.body as {
      email: string;
      password: string;
    };

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
        [email]
      );

      if (userResult.rows.length === 0) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      const user = userResult.rows[0];

      // Verify password
      const isValid = await authService.verifyPassword(password, user.password_hash);

      if (!isValid) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid email or password'
        });
      }

      // Generate tokens
      const tokens = authService.generateTokenPair(user.user_id, user.email);

      // Store refresh token
      const refreshTokenId = authService.generateRefreshTokenId();
      const expiresAt = authService.getRefreshTokenExpiry();
      await db.query(
        'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [refreshTokenId, user.user_id, expiresAt.toISOString()]
      );

      return reply.send({
        message: 'Login successful',
        user: {
          userId: user.user_id,
          email: user.email
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
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
    const { refreshToken } = request.body as {
      refreshToken: string;
    };

    if (!refreshToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    try {
      // Verify refresh token
      const decoded = authService.verifyToken(refreshToken);

      if (!decoded || decoded.type !== 'refresh') {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Invalid refresh token'
        });
      }

      // Check if token exists and is not revoked
      const tokenResult = await db.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked = FALSE',
        [decoded.userId]
      );

      if (tokenResult.rows.length === 0) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token not found or has been revoked'
        });
      }

      const tokenRecord = tokenResult.rows[0];

      // Check expiry
      if (new Date(tokenRecord.expires_at) < new Date()) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Refresh token has expired'
        });
      }

      // Generate new access token (keep same refresh token)
      const tokens = authService.generateTokenPair(decoded.userId, decoded.email);

      return reply.send({
        message: 'Token refreshed successfully',
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: refreshToken // Return same refresh token
        }
      });
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
    const { refreshToken } = request.body as {
      refreshToken: string;
    };

    if (!refreshToken) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    try {
      const decoded = authService.verifyToken(refreshToken);

      if (!decoded) {
        return reply.status(200).send({
          message: 'Logout successful'
        });
      }

      // Revoke all refresh tokens for this user
      await db.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
        [decoded.userId]
      );

      return reply.send({
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to logout'
      });
    }
  });
}
