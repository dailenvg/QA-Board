import { createHmac } from "node:crypto";
import { rateLimitAddress, type RateDecision } from "../capture/rate-limit";
import type { Database } from "../db/database";
import type { Queryable } from "./migrate";
import { serverKey } from "./server-key";

/**
 * The rate limit on review link passwords (037), shared by every server
 * instance through Postgres: 5 wrong passwords per link and address, and 30
 * per address across every link, in 15 minutes. No link ever locks for
 * everyone: only the address guessing waits.
 */

export const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_LINK = 5;
export const MAX_FAILURES_PER_ADDRESS = 30;
/** Attempts older than this are deleted; well past the window. */
const KEEP_ATTEMPTS_MS = 24 * 60 * 60 * 1000;

const ADDRESS_INFO = "squint/share-password-address/v1";

/** Which link, and which address (as `addressKey` stores it). */
export interface PasswordAttemptKey {
  shareId: string;
  ipHash: string;
}

export type PasswordClaim = { ok: true; attemptId: string } | ({ ok: false } & RateDecision);

/**
 * How an address is stored: an HMAC keyed from `AUTH_SECRET`, never the
 * address itself (an unkeyed hash of an IPv4 address is quickly reversed).
 * It's taken as `rateLimitAddress` counts it, so an IPv6 /64 is one address.
 */
export function addressKey(ip: string, secret: string | undefined = process.env.AUTH_SECRET) {
  return createHmac("sha256", serverKey(ADDRESS_INFO, secret))
    .update(rateLimitAddress(ip), "utf8")
    .digest("hex");
}

/**
 * When the `limit`-th most recent attempt matching `filter` in the window
 * ages out (epoch ms), or null when there are fewer than `limit` in it.
 */
async function blockedUntil(
  tx: Queryable,
  filter: string,
  values: unknown[],
  limit: number,
  now: number,
): Promise<number | null> {
  const next = values.length + 1;
  const { rows } = await tx.query<{ at: Date }>(
    `SELECT at FROM squint_share_password_attempts WHERE ${filter} AND at > $${next}
     ORDER BY at DESC OFFSET $${next + 1} LIMIT 1`,
    [...values, new Date(now - PASSWORD_WINDOW_MS), limit - 1],
  );
  return rows[0] ? new Date(rows[0].at).getTime() + PASSWORD_WINDOW_MS : null;
}

/**
 * Claims a password attempt before the password is checked, so the limits
 * hold however many guesses arrive at once: under a transaction-scoped
 * advisory lock on the address (both limits count only its attempts, so its
 * claims take turns), it counts failures and attempts still being checked,
 * then either refuses (with when to retry) or records this attempt. The row
 * stays as a failure unless `releasePasswordClaim` removes it after the right
 * password. Refused attempts aren't recorded, so waiting works.
 */
export function claimPasswordAttempt(
  db: Database,
  key: PasswordAttemptKey,
  now: number,
): Promise<PasswordClaim> {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `squint:share-password:${key.ipHash}`,
    ]);
    const byLink = await blockedUntil(
      tx,
      "share_id = $1 AND ip_hash = $2",
      [key.shareId, key.ipHash],
      MAX_FAILURES_PER_LINK,
      now,
    );
    const byAddress = await blockedUntil(
      tx,
      "ip_hash = $1",
      [key.ipHash],
      MAX_FAILURES_PER_ADDRESS,
      now,
    );
    const until = Math.max(byLink ?? 0, byAddress ?? 0);
    if (until > now) {
      return { ok: false, retryAfterSeconds: Math.ceil((until - now) / 1000) };
    }
    const { rows } = await tx.query<{ id: string | number }>(
      `INSERT INTO squint_share_password_attempts (share_id, ip_hash, at)
       VALUES ($1, $2, $3) RETURNING id`,
      [key.shareId, key.ipHash, new Date(now)],
    );
    return { ok: true, attemptId: String(rows[0]?.id) };
  });
}

/**
 * After the right password: drops this attempt's claim and the address's
 * earlier failures on this link (it starts over there), and prunes old rows.
 * The address keeps its failures on other links.
 */
export async function releasePasswordClaim(
  db: Queryable,
  key: PasswordAttemptKey,
  attemptId: string,
  now: number,
): Promise<void> {
  await db.query(
    `DELETE FROM squint_share_password_attempts
     WHERE id = $1 OR (share_id = $2 AND ip_hash = $3) OR at < $4`,
    [attemptId, key.shareId, key.ipHash, new Date(now - KEEP_ATTEMPTS_MS)],
  );
}

/**
 * Deletes attempts older than a day, for the daily cleanup, so failures don't
 * pile up while nobody enters a right password (`releasePasswordClaim` prunes
 * only after one). Answers how many it deleted.
 */
export async function prunePasswordAttempts(db: Queryable, now: number): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `WITH gone AS (
       DELETE FROM squint_share_password_attempts WHERE at < $1 RETURNING 1
     )
     SELECT count(*)::int AS count FROM gone`,
    [new Date(now - KEEP_ATTEMPTS_MS)],
  );
  return rows[0]?.count ?? 0;
}
