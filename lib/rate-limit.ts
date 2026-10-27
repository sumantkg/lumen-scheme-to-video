/**
 * A small fixed-window rate limiter, kept in process memory.
 *
 * It exists to blunt brute-force logins and render spam, not to be a
 * distributed quota. Each process counts for itself, so a multi-instance
 * deployment should back this with Redis or an edge/WAF rule — the call shape
 * below is exactly what such a backend would implement.
 */

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests allowed per window. */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

/** Drop expired buckets occasionally so a long-lived process doesn't leak. */
function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Count one hit against `key`. A fresh window opens on the first hit, or on
 * the first hit after the previous window elapsed.
 */
export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + rule.windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    ok: bucket.count <= rule.max,
    limit: rule.max,
    remaining: Math.max(0, rule.max - bucket.count),
    resetMs: Math.max(0, bucket.resetAt - now),
  };
}

/** Test seam: forget every counter. */
export function resetRateLimiter(): void {
  buckets.clear();
  lastSweep = 0;
}
