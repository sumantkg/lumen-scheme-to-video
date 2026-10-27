import { NextResponse } from "next/server";

import { rateLimit, type RateLimitRule } from "@/lib/rate-limit";

/**
 * Request helpers shared by the API routes: who is calling, and are they
 * calling too often.
 */

/**
 * Best-effort client address for rate limiting.
 *
 * `x-forwarded-for` is only trustworthy when a proxy sets (and overwrites) it
 * — Vercel, Fly, nginx. Without any header every caller shares the "unknown"
 * bucket, which still bounds abuse but not per-client.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Charge one hit to `key` against `rule`. Returns a ready-to-send 429 when the
 * allowance is spent, or `null` to continue.
 */
export function enforceRateLimit(
  key: string,
  rule: RateLimitRule
): NextResponse | null {
  const result = rateLimit(key, rule);
  if (result.ok) return null;

  const retryAfter = Math.max(1, Math.ceil(result.resetMs / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(retryAfter),
      },
    }
  );
}

/**
 * The allowances in one place, so the policy is reviewable rather than
 * scattered through the handlers.
 */
export const RATE_LIMITS = {
  /** All login attempts from one address. */
  login: { windowMs: 15 * 60_000, max: 20 },
  /** Attempts against a single account, from anywhere. */
  loginAccount: { windowMs: 15 * 60_000, max: 8 },
  /** New accounts from one address. */
  signup: { windowMs: 60 * 60_000, max: 10 },
  /** Projects created by one account. */
  projects: { windowMs: 60 * 60_000, max: 100 },
  /** Pipeline runs (storyboard / clips) started by one account. */
  generate: { windowMs: 60 * 60_000, max: 40 },
  /** File uploads by one account. */
  uploads: { windowMs: 60 * 60_000, max: 200 },
  /** Saving / verifying pasted provider keys. */
  credentials: { windowMs: 60 * 60_000, max: 40 },
  /** Re-running the AI critic on a finished storyboard. */
  critic: { windowMs: 60 * 60_000, max: 30 },
  /** Video editor preview / export merges. Generous limit to support interactive editing. */
  merge: { windowMs: 60 * 60_000, max: 1200 },
} as const satisfies Record<string, RateLimitRule>;
