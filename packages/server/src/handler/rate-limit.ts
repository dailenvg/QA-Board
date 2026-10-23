export interface RateLimitOptions {
  /** Requests allowed per window. Defaults to 10. */
  limit?: number;
  /** Window length in ms. Defaults to 60 000. */
  windowMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  hit(key: string): RateLimitResult;
}

const SWEEP_THRESHOLD = 10_000;

/**
 * Sliding-window log limiter held in memory. Best effort only: every
 * serverless instance keeps its own counters and they reset on cold start.
 */
export function createRateLimiter({
  limit = 10,
  windowMs = 60_000,
  now = Date.now,
}: RateLimitOptions = {}): RateLimiter {
  const hits = new Map<string, number[]>();

  const sweep = (cutoff: number) => {
    for (const [key, stamps] of hits) {
      if ((stamps[stamps.length - 1] ?? 0) <= cutoff) hits.delete(key);
    }
  };

  return {
    hit(key) {
      const current = now();
      const cutoff = current - windowMs;
      if (hits.size > SWEEP_THRESHOLD) sweep(cutoff);

      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        const oldest = recent[0] ?? current;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - current) / 1000)),
        };
      }
      recent.push(current);
      hits.set(key, recent);
      return { allowed: true };
    },
  };
}
