import type { RateDecision } from "../capture/rate-limit";
import type { Queryable } from "../share/migrate";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;
/** Failures older than this are deleted; well past the window. */
const KEEP_FAILURES_MS = 24 * 60 * 60 * 1000;

export interface LoginKey {
  /** Normalized, whether or not an account has it. */
  email: string;
  ip: string;
}

/**
 * When the `limit`-th most recent failure in the window ages out (epoch ms),
 * or null when there are fewer than `limit` failures in it.
 */
async function blockedUntil(
  db: Queryable,
  column: "email" | "ip",
  value: string,
  limit: number,
  now: number,
): Promise<number | null> {
  const { rows } = await db.query<{ at: Date }>(
    `SELECT at FROM login_attempts WHERE ${column} = $1 AND at > $2
     ORDER BY at DESC OFFSET $3 LIMIT 1`,
    [value, new Date(now - LOGIN_WINDOW_MS), limit - 1],
  );
  return rows[0] ? new Date(rows[0].at).getTime() + LOGIN_WINDOW_MS : null;
}

/**
 * Whether a sign-in may be tried: refused once the email has 5 failures, or
 * the address 20, in the last 15 minutes, until enough of them age out. Refused
 * tries aren't recorded, so waiting always works.
 */
export async function checkLoginLimit(
  db: Queryable,
  key: LoginKey,
  now: number,
): Promise<RateDecision> {
  const [byEmail, byIp] = await Promise.all([
    blockedUntil(db, "email", key.email, MAX_FAILURES_PER_EMAIL, now),
    blockedUntil(db, "ip", key.ip, MAX_FAILURES_PER_IP, now),
  ]);
  const until = Math.max(byEmail ?? 0, byIp ?? 0);
  return until > now
    ? { ok: false, retryAfterSeconds: Math.ceil((until - now) / 1000) }
    : { ok: true };
}

export async function recordLoginFailure(db: Queryable, key: LoginKey, now: number): Promise<void> {
  await db.query("INSERT INTO login_attempts (email, ip, at) VALUES ($1, $2, $3)", [
    key.email,
    key.ip,
    new Date(now),
  ]);
}

/** After a successful sign-in: that email starts over. Also prunes old rows. */
export async function clearLoginFailures(db: Queryable, email: string, now: number): Promise<void> {
  await db.query("DELETE FROM login_attempts WHERE email = $1 OR at < $2", [
    email,
    new Date(now - KEEP_FAILURES_MS),
  ]);
}
