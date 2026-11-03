import type { RateDecision } from "../capture/rate-limit";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 20;
/** Attempts older than this are deleted; well past the window. */
const KEEP_FAILURES_MS = 24 * 60 * 60 * 1000;

export interface LoginKey {
  /** Normalized, whether or not an account has it. */
  email: string;
  ip: string;
}

export type LoginClaim = { ok: true; attemptId: string } | ({ ok: false } & RateDecision);

/**
 * When the `limit`-th most recent attempt in the window ages out (epoch ms),
 * or null when there are fewer than `limit` attempts in it.
 */
async function blockedUntil(
  tx: Queryable,
  column: "email" | "ip",
  value: string,
  limit: number,
  now: number,
): Promise<number | null> {
  const { rows } = await tx.query<{ at: Date }>(
    `SELECT at FROM login_attempts WHERE ${column} = $1 AND at > $2
     ORDER BY at DESC OFFSET $3 LIMIT 1`,
    [value, new Date(now - LOGIN_WINDOW_MS), limit - 1],
  );
  return rows[0] ? new Date(rows[0].at).getTime() + LOGIN_WINDOW_MS : null;
}

/** Holds a transaction-scoped advisory lock on `name` until the transaction ends. */
async function lock(tx: Queryable, name: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [name]);
}

/**
 * Claims a sign-in attempt before the password is checked, so the limits hold
 * however many requests arrive at once: 5 per email and 20 per address in 15
 * minutes, counting failures and attempts still being checked. Under advisory
 * locks on the email, then the address (always that order, so two claims can't
 * deadlock), it counts the window and either refuses (with when to retry) or
 * records the attempt. The row stays as a failure unless `releaseLoginClaim`
 * removes it after a success. Refused tries aren't recorded, so waiting works.
 */
export function claimLoginAttempt(db: Database, key: LoginKey, now: number): Promise<LoginClaim> {
  return db.transaction(async (tx) => {
    await lock(tx, `squint:login:email:${key.email}`);
    await lock(tx, `squint:login:ip:${key.ip}`);
    const byEmail = await blockedUntil(tx, "email", key.email, MAX_FAILURES_PER_EMAIL, now);
    const byIp = await blockedUntil(tx, "ip", key.ip, MAX_FAILURES_PER_IP, now);
    const until = Math.max(byEmail ?? 0, byIp ?? 0);
    if (until > now) {
      return { ok: false, retryAfterSeconds: Math.ceil((until - now) / 1000) };
    }
    const { rows } = await tx.query<{ id: string | number }>(
      "INSERT INTO login_attempts (email, ip, at) VALUES ($1, $2, $3) RETURNING id",
      [key.email, key.ip, new Date(now)],
    );
    return { ok: true, attemptId: String(rows[0]?.id) };
  });
}

/**
 * After a successful sign-in: drops this attempt's claim and the email's
 * earlier failures (it starts over), and prunes old rows. Its address keeps
 * its other failures.
 */
export async function releaseLoginClaim(
  db: Queryable,
  email: string,
  attemptId: string,
  now: number,
): Promise<void> {
  await db.query("DELETE FROM login_attempts WHERE id = $1 OR email = $2 OR at < $3", [
    attemptId,
    email,
    new Date(now - KEEP_FAILURES_MS),
  ]);
}
