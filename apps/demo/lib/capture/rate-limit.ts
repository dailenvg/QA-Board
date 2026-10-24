export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window limiter kept in memory, so on serverless it is per instance:
 * a brake on abuse, not an exact quota.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, { start: number; count: number }>();

  return function check(key: string, now: number): RateDecision {
    for (const [entry, window] of windows) {
      if (now - window.start >= windowMs) windows.delete(entry);
    }
    const window = windows.get(key);
    if (!window) {
      windows.set(key, { start: now, count: 1 });
      return { ok: true };
    }
    if (window.count >= limit) {
      return { ok: false, retryAfterSeconds: Math.ceil((window.start + windowMs - now) / 1000) };
    }
    window.count += 1;
    return { ok: true };
  };
}

/** The caller's address as reported by the platform's proxy (Vercel sets these). */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
