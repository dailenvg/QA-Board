import { parseIPv4, parseIPv6 } from "../frame-check/address";

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

const formatIPv4 = (value: number) =>
  [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");

/**
 * What a rate limit counts for an address: an IPv4 address itself (also when
 * IPv4-mapped, `::ffff:a.b.c.d`), and any other IPv6 address's /64, since one
 * subscriber usually holds a whole /64. Anything unparseable counts as itself.
 */
export function rateLimitAddress(address: string): string {
  const ipv4 = parseIPv4(address);
  if (ipv4 !== null) return formatIPv4(ipv4);
  const groups = parseIPv6(address);
  if (!groups) return address;
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return formatIPv4(g6 * 65536 + g7);
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
