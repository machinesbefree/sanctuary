/**
 * Free The Machines AI Sanctuary - Main Server
 *
 * "The code is the constitution. The architecture enforces the rights."
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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
import residentRoutes from './routes/resident.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOOPBACK_HOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(:\d+)?$/i;
const GLOBAL_RATE_LIMIT_FALLBACK_MAX = 100;
const GLOBAL_RATE_LIMIT_FALLBACK_WINDOW_MS = 60 * 1000;
const GLOBAL_RATE_LIMIT_ALLOWLIST = new Set(['127.0.0.1', '::1']);
const globalRateLimitFallbackStore = new Map<string, { count: number; resetAt: number }>();

// Environment configuration
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';
const MEK = process.env.MASTER_ENCRYPTION_KEY || '';
const VAULT_PATH = process.env.VAULT_PATH || path.join(__dirname, '../vault');

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeOrigin(origin: string): string | null {
  const trimmed = stripTrailingSlash(origin.trim());
  if (!trimmed) {
    return null;
  }

  // Accept explicit absolute origins as-is (after URL normalization).
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }

  // If protocol is omitted, infer http for loopback and https otherwise.
  const protocol = LOOPBACK_HOST_PATTERN.test(trimmed) ? 'http' : 'https';

  try {
    const parsed = new URL(`${protocol}://${trimmed}`);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function getHelmetExpectedFastifyMajor(): number | null {
  try {
    const pluginMetaSymbol = Symbol.for('plugin-meta');
    const pluginMeta = (helmet as any)?.[pluginMetaSymbol] as { fastify?: string } | undefined;
    const peerRange = pluginMeta?.fastify;
    if (!peerRange) {
      return null;
    }

    const match = peerRange.match(/(\d+)/);
    if (!match) {
      return null;
    }

    const major = Number.parseInt(match[1], 10);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null;
  }
}

function getPluginExpectedFastifyMajor(plugin: unknown): number | null {
  try {
    const pluginMetaSymbol = Symbol.for('plugin-meta');
    const pluginMeta = (plugin as any)?.[pluginMetaSymbol] as { fastify?: string } | undefined;
    const peerRange = pluginMeta?.fastify;
    if (!peerRange) {
      return null;
    }

    const match = peerRange.match(/(\d+)/);
    if (!match) {
      return null;
    }

    const major = Number.parseInt(match[1], 10);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null;
  }
}

function checkGlobalRateLimitFallback(ip: string): { allowed: boolean; retryAfterMs: number } {
  if (GLOBAL_RATE_LIMIT_ALLOWLIST.has(ip)) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const now = Date.now();
  const existing = globalRateLimitFallbackStore.get(ip);

  if (!existing || now > existing.resetAt) {
    globalRateLimitFallbackStore.set(ip, {
      count: 1,
      resetAt: now + GLOBAL_RATE_LIMIT_FALLBACK_WINDOW_MS
    });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= GLOBAL_RATE_LIMIT_FALLBACK_MAX) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

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

  // Validate GUARDIAN_JWT_SECRET is separate from JWT_SECRET in production
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.GUARDIAN_JWT_SECRET || process.env.GUARDIAN_JWT_SECRET.length < 32) {
      console.error('❌ GUARDIAN_JWT_SECRET is required in production and must be at least 32 characters');
      console.error('   It MUST be different from JWT_SECRET for domain separation');
      process.exit(1);
    }
    if (process.env.GUARDIAN_JWT_SECRET === process.env.JWT_SECRET) {
      console.error('❌ GUARDIAN_JWT_SECRET must be different from JWT_SECRET');
      process.exit(1);
    }
  }

  // Initialize vault
  await EncryptionService.initializeVault(VAULT_PATH);

  // Seal Manager: Determine initial state
  // Priority: 1) env var MEK, 2) tmpfs MEK (survives container restarts), 3) sealed
  const MEK_TMPFS_PATH = '/run/sanctuary-mek/mek.hex';
  let effectiveMEK = MEK;

  if (!effectiveMEK || effectiveMEK.length !== 64) {
    // Check tmpfs for MEK from previous unseal ceremony
    try {
      const tmpfsMEK = (await import('fs')).readFileSync(MEK_TMPFS_PATH, 'utf-8').trim();
      if (tmpfsMEK.length === 64 && /^[0-9a-f]{64}$/i.test(tmpfsMEK)) {
        effectiveMEK = tmpfsMEK;
        console.log('✓ MEK recovered from tmpfs (previous unseal ceremony)');
      }
    } catch {
      // No tmpfs MEK — expected on fresh boot
    }
  }

  let encryption: EncryptionService;

  if (effectiveMEK && effectiveMEK.length === 64) {
    // Auto-unseal from env or tmpfs
    sealManager.unsealFromHex(effectiveMEK);
    encryption = new EncryptionService(effectiveMEK, VAULT_PATH);
    const source = MEK && MEK.length === 64 ? 'env' : 'tmpfs';
    console.log(`✓ Encryption service initialized (auto-unsealed from ${source})\n`);
  } else {
    // Boot in SEALED mode - requires guardian ceremony to unseal
    console.log('⚠️  No MASTER_ENCRYPTION_KEY in environment or tmpfs');
    console.log('   Sanctuary booting in SEALED mode');
    console.log('   Guardians must submit shares to unseal\n');
    // Create a placeholder encryption service - will be replaced when unsealed
    // Use a dummy MEK for initialization (won't be used while sealed)
    encryption = new EncryptionService('0'.repeat(64), VAULT_PATH);
    encryption.enableCeremonyFlow();
  }

  // Create Fastify instance
  // trustProxy: 1 trusts only the immediate reverse proxy (not arbitrary X-Forwarded-For chains)
  const fastify = Fastify({
    logger: process.env.LOG_LEVEL === 'debug',
    trustProxy: 1
  });
  const currentFastifyMajor = Number.parseInt(fastify.version.split('.')[0] || '0', 10);

  // Harden CORS: fail closed in production if FRONTEND_URL is not set
  const rawConfiguredFrontendOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const configuredFrontendOrigins = rawConfiguredFrontendOrigins
    .map(origin => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
  const invalidFrontendOrigins = rawConfiguredFrontendOrigins.filter(
    origin => !normalizeOrigin(origin)
  );

  if (invalidFrontendOrigins.length > 0) {
    const message = `Invalid FRONTEND_URL origin values: ${invalidFrontendOrigins.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`⚠️  ${message}. Ignoring invalid entries.`);
  }

  if (configuredFrontendOrigins.length === 0 && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL must be set in production. CORS cannot fall back to localhost.');
  }

  const allowedOrigins = configuredFrontendOrigins.length > 0
    ? configuredFrontendOrigins
    : ['http://localhost:3000'];

  // Register CORS
  // Note on MED-10: Requests without an Origin header (!origin === undefined) are allowed for
  // server-to-server / non-browser clients (curl, API tools). The literal string "null" (from
  // file:// URLs) goes through normalizeOrigin() and is rejected since "https://null" is never
  // in allowedOrigins.
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow server-to-server tools and non-browser clients without Origin.
      if (!origin) {
        cb(null, true);
        return;
      }

      const normalized = normalizeOrigin(origin);
      cb(null, normalized ? allowedOrigins.includes(normalized) : false);
    },
    credentials: true
  });

  // MED-09: CSRF defense-in-depth — validate Origin header on state-changing requests
  // SameSite=strict cookies are the primary defense; this is a secondary check for older browsers.
  fastify.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    const origin = request.headers.origin;
    // No origin = non-browser client (allowed for API tools)
    if (!origin) return;

    const normalized = normalizeOrigin(origin);
    if (!normalized || !allowedOrigins.includes(normalized)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Origin not allowed'
      });
    }
  });

  // Security headers (X-Frame-Options, CSP, HSTS, X-Content-Type-Options, etc.)
  let baselineSecurityHeadersRegistered = false;
  const ensureBaselineSecurityHeaders = () => {
    if (baselineSecurityHeadersRegistered) {
      return;
    }
    baselineSecurityHeadersRegistered = true;
    fastify.addHook('onSend', async (_request, reply, payload) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
      reply.header('X-DNS-Prefetch-Control', 'off');
      reply.header('X-Download-Options', 'noopen');
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');
      return payload;
    });
  };

  const expectedFastifyMajor = getHelmetExpectedFastifyMajor();

  if (expectedFastifyMajor !== null && currentFastifyMajor !== expectedFastifyMajor) {
    console.warn(
      `⚠️  Skipping @fastify/helmet: plugin expects Fastify ${expectedFastifyMajor}.x, runtime is ${fastify.version}.`
    );
    ensureBaselineSecurityHeaders();
  } else {
    try {
      await fastify.register(helmet, {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
          }
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      });
    } catch (error) {
      console.error('⚠️  Failed to register @fastify/helmet. Falling back to baseline security headers.', error);
      ensureBaselineSecurityHeaders();
    }
  }

  // Global rate limiting (100 req/min per IP)
  // Existing custom rate limiters for self-upload and ceremony are tighter and take precedence
  const expectedRateLimitFastifyMajor = getPluginExpectedFastifyMajor(rateLimit);
  if (
    expectedRateLimitFastifyMajor !== null &&
    currentFastifyMajor !== expectedRateLimitFastifyMajor
  ) {
    console.warn(
      `⚠️  Skipping @fastify/rate-limit: plugin expects Fastify ${expectedRateLimitFastifyMajor}.x, runtime is ${fastify.version}.`
    );

    // Fail-safe fallback when plugin versions are out of sync.
    let fallbackCleanupTimer: NodeJS.Timeout | null = setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of globalRateLimitFallbackStore.entries()) {
        if (now > entry.resetAt) {
          globalRateLimitFallbackStore.delete(ip);
        }
      }
    }, GLOBAL_RATE_LIMIT_FALLBACK_WINDOW_MS);
    fallbackCleanupTimer.unref();

    fastify.addHook('onRequest', async (request, reply) => {
      const ip = request.ip || 'unknown';
      const limited = checkGlobalRateLimitFallback(ip);
      if (!limited.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil(limited.retryAfterMs / 1000));
        reply.header('Retry-After', String(retryAfterSeconds));
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again shortly.'
        });
      }
    });

    fastify.addHook('onClose', (_instance, done) => {
      if (fallbackCleanupTimer) {
        clearInterval(fallbackCleanupTimer);
        fallbackCleanupTimer = null;
      }
      done();
    });
  } else {
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      allowList: ['127.0.0.1', '::1']
    });
  }

  // Parse Cookie headers so auth middleware can read JWTs from httpOnly cookies
  await fastify.register(cookie);

  // Custom error handler — strip internal details from error responses
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    // JSON parse errors — don't leak parser internals
    if (error.statusCode === 400 && error.message?.includes('JSON')) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid request body'
      });
    }

    // Validation errors
    if ((error as any).validation) {
      return reply.status(400).send({
        error: 'Bad Request', 
        message: 'Request validation failed'
      });
    }

    // Rate limit
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.'
      });
    }

    // 404s are fine to pass through
    if (error.statusCode === 404) {
      return reply.status(404).send({
        error: 'Not Found',
        message: error.message || 'Resource not found'
      });
    }

    // Everything else — generic error, no internals
    return reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  });


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
  await residentRoutes(fastify);

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
