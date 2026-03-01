/**
 * Shared in-memory rate limiter with LRU eviction.
 * Used by auth, guardian-auth, and ceremony routes.
 *
 * NOTE: In-memory rate limits reset on server restart and are not shared across
 * instances. For production multi-instance deployments, replace with Redis or
 * database-backed storage.
 */

export interface RateLimitConfig {
  /** Maximum attempts before blocking */
  maxAttempts: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum entries before LRU eviction (default: 10_000) */
  maxEntries?: number;
  /** Cleanup interval in milliseconds (default: 60_000) */
  cleanupIntervalMs?: number;
}

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      maxAttempts: config.maxAttempts,
      windowMs: config.windowMs,
      maxEntries: config.maxEntries ?? 10_000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60_000,
    };
  }

  /** Start the periodic cleanup timer. Call .stop() to clear it. */
  start(): this {
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
      this.cleanupTimer.unref();
    }
    return this;
  }

  /** Stop the cleanup timer (for graceful shutdown). */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Check and consume one attempt for the given key. */
  check(key: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const record = this.store.get(key);

    // Expired — remove
    if (record && now > record.resetAt) {
      this.store.delete(key);
    }

    const current = this.store.get(key);

    if (!current) {
      this.touch(key, { attempts: 1, resetAt: now + this.config.windowMs });
      this.evictIfNeeded();
      return { allowed: true, remaining: this.config.maxAttempts - 1 };
    }

    // Move to end (LRU touch)
    this.touch(key, current);

    if (current.attempts >= this.config.maxAttempts) {
      return { allowed: false, remaining: 0 };
    }

    current.attempts++;
    this.touch(key, current);
    this.evictIfNeeded();
    return { allowed: true, remaining: this.config.maxAttempts - current.attempts };
  }

  /** Reset (delete) a key — e.g., after successful login. */
  reset(key: string): void {
    this.store.delete(key);
  }

  private touch(key: string, entry: RateLimitEntry): void {
    // Delete + re-insert to maintain insertion order (LRU)
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, entry);
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.config.maxEntries) {
      const lruKey = this.store.keys().next().value as string | undefined;
      if (!lruKey) break;
      this.store.delete(lruKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}
