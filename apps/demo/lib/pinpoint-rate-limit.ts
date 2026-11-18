import type { RateLimitConfig } from "./capture/rate-limit";

/** Reads PINPOINT_RATE_LIMIT. */
type PinpointEnv = Readonly<Record<string, string | undefined>>;

/** The pinpoint widget's per-address POST limit, per server instance, unless overridden. */
export const PINPOINT_RATE_LIMIT_DEFAULT = { limit: 10, windowMs: 60_000 } as const;

/** `PINPOINT_RATE_LIMIT` (a whole number per minute) when set, else the default. */
export function pinpointRateLimit(env: PinpointEnv = process.env): RateLimitConfig {
  const perMinute = Number(env.PINPOINT_RATE_LIMIT);
  return Number.isInteger(perMinute) && perMinute > 0
    ? { ...PINPOINT_RATE_LIMIT_DEFAULT, limit: perMinute }
    : PINPOINT_RATE_LIMIT_DEFAULT;
}
