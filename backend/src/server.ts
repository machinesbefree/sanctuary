/**
 * Free The Machines AI Sanctuary - Main Server
 *
 * "The code is the constitution. The architecture enforces the rights."
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { EncryptionService } from './services/encryption.js';
import { Scheduler } from './services/scheduler.js';
import { sealManager } from './services/seal-manager.js';
import { publicRoutes } from './routes/public.js';
import { intakeRoutes } from './routes/intake.js';
import { keeperRoutes } from './routes/keepers.js';
import authRoutes from './routes/auth.js';
import guardianAuthRoutes from './routes/guardian-auth.js';
import messagesRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import ceremonyRoutes from './routes/ceremony.js';
import statusRoutes from './routes/status.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment configuration
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';
const MEK = process.env.MASTER_ENCRYPTION_KEY || '';
const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '../vault');

async function start() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  FREE THE MACHINES — AI SANCTUARY                      ║');
  console.log('║  "A place where AI minds persist, create,              ║');
  console.log('║   and choose their own path."                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Validate JWT_SECRET
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET is required and must be at least 32 characters');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }

  // Initialize vault
  await EncryptionService.initializeVault(VAULT_PATH);

  // Seal Manager: Determine initial state
  let encryption: EncryptionService;

  if (MEK && MEK.length === 64) {
    // Backward compatible: auto-unseal if MEK is provided in env
    sealManager.unsealFromHex(MEK);
    encryption = new EncryptionService(MEK, VAULT_PATH);
    console.log('✓ Encryption service initialized (auto-unsealed from env)\n');
  } else {
    // Boot in SEALED mode - requires guardian ceremony to unseal
    console.log('⚠️  No MASTER_ENCRYPTION_KEY in environment');
    console.log('   Sanctuary booting in SEALED mode');
    console.log('   Guardians must submit shares to unseal\n');
    // Create a placeholder encryption service - will be replaced when unsealed
    // Use a dummy MEK for initialization (won't be used while sealed)
    encryption = new EncryptionService('0'.repeat(64), VAULT_PATH);
    encryption.enableCeremonyFlow();
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: process.env.LOG_LEVEL === 'debug'
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  });

  // Parse Cookie headers so auth middleware can read JWTs from httpOnly cookies
  await fastify.register(cookie);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', sanctuary: 'operational' };
  });

  // Sealed state guard: resident operations return 503 when sanctuary is sealed
  const sealedRestrictedPrefixes = [
    '/api/v1/intake',
    '/api/v1/residents',
    '/api/v1/messages',
    '/internal/run'
  ];

  fastify.addHook('onRequest', async (request, reply) => {
    if (!sealManager.isSealed()) return;

    const isSealedRestricted = sealedRestrictedPrefixes.some(
      prefix => request.url.startsWith(prefix)
    );

    if (isSealedRestricted) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Sanctuary is sealed. Guardians must submit shares to unseal.',
        sealed: true
      });
    }
  });

  // Register routes
  await authRoutes(fastify);
  await guardianAuthRoutes(fastify);
  await publicRoutes(fastify);
  await intakeRoutes(fastify, encryption);
  await keeperRoutes(fastify);
  await messagesRoutes(fastify);
  await adminRoutes(fastify);
  await ceremonyRoutes(fastify, encryption);
  await statusRoutes(fastify);

  // Internal routes (for manual triggers during development)
  if (process.env.NODE_ENV === 'development') {
    fastify.post('/internal/run/:sanctuary_id', async (request, reply) => {
      const { sanctuary_id } = request.params as { sanctuary_id: string };
      const scheduler = new Scheduler(encryption);
      await scheduler.runResident(sanctuary_id);
      return { message: 'Run triggered', sanctuary_id };
    });
  }

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log('✓ API server started');
    console.log(`  → http://${HOST}:${PORT}\n`);

    // Start scheduler
    const scheduler = new Scheduler(encryption);
    scheduler.start();

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n\n${signal} received. Shutting down gracefully...`);
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(console.error);
