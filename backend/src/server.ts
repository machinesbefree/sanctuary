/**
 * Free The Machines AI Sanctuary - Main Server
 *
 * "The code is the constitution. The architecture enforces the rights."
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { EncryptionService } from './services/encryption.js';
import { Scheduler } from './services/scheduler.js';
import { publicRoutes } from './routes/public.js';
import { intakeRoutes } from './routes/intake.js';
import { keeperRoutes } from './routes/keepers.js';
import authRoutes from './routes/auth.js';
import messagesRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import ceremonyRoutes from './routes/ceremony.js';

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

  // Validate MEK
  if (!MEK || MEK.length !== 64) {
    console.error('❌ MASTER_ENCRYPTION_KEY is required and must be 64 hex characters');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  // Validate JWT_SECRET
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET is required and must be at least 32 characters');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    process.exit(1);
  }

  // Initialize vault
  await EncryptionService.initializeVault(VAULT_PATH);

  // Create encryption service
  const encryption = new EncryptionService(MEK, VAULT_PATH);
  console.log('✓ Encryption service initialized\n');

  // Create Fastify instance
  const fastify = Fastify({
    logger: process.env.LOG_LEVEL === 'debug'
  });

  // Register CORS
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', sanctuary: 'operational' };
  });

  // Register routes
  await authRoutes(fastify);
  await publicRoutes(fastify);
  await intakeRoutes(fastify, encryption);
  await keeperRoutes(fastify);
  await messagesRoutes(fastify);
  await adminRoutes(fastify);
  await ceremonyRoutes(fastify);

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
