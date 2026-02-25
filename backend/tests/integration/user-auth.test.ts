import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { getCookieValue, hasSetCookie } from '../helpers/http';
import { createUserAuthApp } from '../helpers/test-app';
import type { FakeDb } from '../helpers/fake-db';

describe('User auth integration', () => {
  let app: FastifyInstance;
  let db: FakeDb;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-which-is-long-enough-1234567890';
    const ctx = await createUserAuthApp();
    app = ctx.app;
    db = ctx.db;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('register', () => {
    it('registers a user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'new-user@example.com',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().user.email).toBe('new-user@example.com');
      expect(hasSetCookie(response.headers['set-cookie'], 'sanctuary_access_token')).toBe(true);
      expect(hasSetCookie(response.headers['set-cookie'], 'sanctuary_refresh_token')).toBe(true);
    });

    it('returns 409 for duplicate email', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'dupe@example.com',
          password: 'StrongPass1'
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'dupe@example.com',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(409);
    });

    it('returns 400 for weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'weak@example.com',
          password: 'weak'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/Password/);
    });

    it('returns 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'missing@example.com'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('rate limits after too many attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'ratelimit-register@example.com',
            password: 'weak'
          },
          remoteAddress: '203.0.113.10'
        });

        expect(res.statusCode).toBe(400);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'ratelimit-register@example.com',
          password: 'weak'
        },
        remoteAddress: '203.0.113.10'
      });

      expect(blocked.statusCode).toBe(429);
    });
  });

  describe('login', () => {
    it('logs in successfully and sets auth cookies', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);
      db.users.push({
        user_id: 'user-login-1',
        email: 'login@example.com',
        password_hash: passwordHash,
        is_active: true,
        is_admin: false
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'login@example.com',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(hasSetCookie(response.headers['set-cookie'], 'sanctuary_access_token')).toBe(true);
      expect(hasSetCookie(response.headers['set-cookie'], 'sanctuary_refresh_token')).toBe(true);
    });

    it('returns 401 for wrong password', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);
      db.users.push({
        user_id: 'user-login-2',
        email: 'wrong-password@example.com',
        password_hash: passwordHash,
        is_active: true,
        is_admin: false
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'wrong-password@example.com',
          password: 'WrongPass9'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'missing-login@example.com'
        }
      });

      expect(response.statusCode).toBe(400);
    });

    it('rate limits login after too many attempts', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);
      db.users.push({
        user_id: 'user-login-3',
        email: 'ratelimit-login@example.com',
        password_hash: passwordHash,
        is_active: true,
        is_admin: false
      });

      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'ratelimit-login@example.com',
            password: 'WrongPass9'
          },
          remoteAddress: '203.0.113.20'
        });

        expect(res.statusCode).toBe(401);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'ratelimit-login@example.com',
          password: 'WrongPass9'
        },
        remoteAddress: '203.0.113.20'
      });

      expect(blocked.statusCode).toBe(429);
    });
  });

  describe('refresh token', () => {
    it('refreshes token when valid cookie is present', async () => {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'refresh@example.com',
          password: 'StrongPass1'
        }
      });

      const refreshToken = getCookieValue(registerResponse.headers['set-cookie'], 'sanctuary_refresh_token');
      expect(refreshToken).toBeTruthy();

      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          cookie: `sanctuary_refresh_token=${refreshToken}`
        }
      });

      expect(refreshResponse.statusCode).toBe(200);
      expect(hasSetCookie(refreshResponse.headers['set-cookie'], 'sanctuary_access_token')).toBe(true);
      expect(hasSetCookie(refreshResponse.headers['set-cookie'], 'sanctuary_refresh_token')).toBe(true);
    });

    it('returns 400 when refresh cookie is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh'
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 for invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          cookie: 'sanctuary_refresh_token=invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 for expired refresh token', async () => {
      const expiredRefresh = jwt.sign(
        {
          userId: 'user-expired',
          email: 'expired@example.com',
          type: 'refresh'
        },
        process.env.JWT_SECRET!,
        { expiresIn: -10 }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          cookie: `sanctuary_refresh_token=${expiredRefresh}`
        }
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('clears auth cookies on logout', async () => {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'logout@example.com',
          password: 'StrongPass1'
        }
      });

      const refreshToken = getCookieValue(registerResponse.headers['set-cookie'], 'sanctuary_refresh_token');
      expect(refreshToken).toBeTruthy();

      const logoutResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          cookie: `sanctuary_refresh_token=${refreshToken}`
        }
      });

      expect(logoutResponse.statusCode).toBe(200);
      expect(hasSetCookie(logoutResponse.headers['set-cookie'], 'sanctuary_access_token')).toBe(true);
      expect(hasSetCookie(logoutResponse.headers['set-cookie'], 'sanctuary_refresh_token')).toBe(true);
    });
  });
});
