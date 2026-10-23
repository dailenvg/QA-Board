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
  /** Records an attempt and reports whether it was within the limit. */
  hit(key: string): RateLimitResult;
  /** Reports whether `key` is currently over the limit without recording anything. */
  check(key: string): RateLimitResult;
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

  const evaluate = (key: string, record: boolean): RateLimitResult => {
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
    if (record) recent.push(current);
    if (recent.length > 0) hits.set(key, recent);
    else hits.delete(key);
    return { allowed: true };
  };

  return {
    hit: (key) => evaluate(key, true),
    check: (key) => evaluate(key, false),
  };
}
