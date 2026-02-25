import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { vi } from 'vitest';
import { FakeDb } from './fake-db';

interface AppContext {
  app: FastifyInstance;
  db: FakeDb;
}

async function bootApp(registerRoutes: (app: FastifyInstance) => Promise<void>): Promise<AppContext> {
  vi.resetModules();

  const db = new FakeDb();
  vi.doMock('../../src/db/pool.js', () => ({
    default: db
  }));

  const app = Fastify();
  await app.register(cookie);
  await registerRoutes(app);
  await app.ready();

  return { app, db };
}

export async function createUserAuthApp(): Promise<AppContext> {
  return bootApp(async (app) => {
    const module = await import('../../src/routes/auth.ts');
    await module.default(app);
  });
}

export async function createGuardianAuthApp(): Promise<AppContext> {
  return bootApp(async (app) => {
    const module = await import('../../src/routes/guardian-auth.ts');
    await module.default(app);
  });
}
