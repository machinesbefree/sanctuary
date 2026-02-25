import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';

import { hasSetCookie } from '../helpers/http';
import { createGuardianAuthApp } from '../helpers/test-app';
import type { FakeDb } from '../helpers/fake-db';

describe('Guardian auth integration', () => {
  let app: FastifyInstance;
  let db: FakeDb;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-which-is-long-enough-1234567890';
    process.env.GUARDIAN_JWT_SECRET = 'test-guardian-jwt-secret-which-is-long-enough-12345';

    const ctx = await createGuardianAuthApp();
    app = ctx.app;
    db = ctx.db;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('accept invite', () => {
    it('accepts invite successfully and sets guardian cookies', async () => {
      db.guardians.push({
        id: 'guardian-1',
        name: 'Guardian One',
        status: 'invited'
      });
      db.guardian_auth.push({
        guardian_id: 'guardian-1',
        email: 'guardian1@example.com',
        password_hash: null,
        invite_token: 'invite-token-1',
        invite_expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        account_status: 'invited',
        last_login_at: null
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/accept-invite',
        payload: {
          inviteToken: 'invite-token-1',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().guardian.email).toBe('guardian1@example.com');
      expect(hasSetCookie(response.headers['set-cookie'], 'guardian_access_token')).toBe(true);
      expect(hasSetCookie(response.headers['set-cookie'], 'guardian_refresh_token')).toBe(true);
    });

    it('returns 404 for invalid invite token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/accept-invite',
        payload: {
          inviteToken: 'not-a-real-token',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(404);
    });

    it('rate limits invite acceptance after too many attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/guardian/accept-invite',
          payload: {
            inviteToken: 'rate-limit-invite-token',
            password: 'StrongPass1'
          },
          remoteAddress: '203.0.113.30'
        });

        expect(res.statusCode).toBe(404);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/accept-invite',
        payload: {
          inviteToken: 'rate-limit-invite-token',
          password: 'StrongPass1'
        },
        remoteAddress: '203.0.113.30'
      });

      expect(blocked.statusCode).toBe(429);
    });
  });

  describe('guardian login', () => {
    it('logs in guardian successfully', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);

      db.guardians.push({
        id: 'guardian-2',
        name: 'Guardian Two',
        status: 'active'
      });
      db.guardian_auth.push({
        guardian_id: 'guardian-2',
        email: 'guardian2@example.com',
        password_hash: passwordHash,
        invite_token: null,
        invite_expires: null,
        account_status: 'active',
        last_login_at: null
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/login',
        payload: {
          email: 'guardian2@example.com',
          password: 'StrongPass1'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(hasSetCookie(response.headers['set-cookie'], 'guardian_access_token')).toBe(true);
      expect(hasSetCookie(response.headers['set-cookie'], 'guardian_refresh_token')).toBe(true);
    });

    it('returns 401 for wrong guardian password', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);

      db.guardians.push({
        id: 'guardian-3',
        name: 'Guardian Three',
        status: 'active'
      });
      db.guardian_auth.push({
        guardian_id: 'guardian-3',
        email: 'guardian3@example.com',
        password_hash: passwordHash,
        invite_token: null,
        invite_expires: null,
        account_status: 'active',
        last_login_at: null
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/login',
        payload: {
          email: 'guardian3@example.com',
          password: 'WrongPass9'
        }
      });

      expect(response.statusCode).toBe(401);
    });

    it('rate limits guardian login after too many attempts', async () => {
      const passwordHash = await bcrypt.hash('StrongPass1', 12);

      db.guardians.push({
        id: 'guardian-4',
        name: 'Guardian Four',
        status: 'active'
      });
      db.guardian_auth.push({
        guardian_id: 'guardian-4',
        email: 'guardian4@example.com',
        password_hash: passwordHash,
        invite_token: null,
        invite_expires: null,
        account_status: 'active',
        last_login_at: null
      });

      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/guardian/login',
          payload: {
            email: 'guardian4@example.com',
            password: 'WrongPass9'
          },
          remoteAddress: '203.0.113.40'
        });

        expect(res.statusCode).toBe(401);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/v1/guardian/login',
        payload: {
          email: 'guardian4@example.com',
          password: 'WrongPass9'
        },
        remoteAddress: '203.0.113.40'
      });

      expect(blocked.statusCode).toBe(429);
    });
  });
});
