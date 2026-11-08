import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { createSecret, hashSecret, isSecretShape } from "../share/tokens";
import { auditAccount } from "./audit";

/** An email change link works for one hour, once. */
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
/** At most this many requests per account per hour; past it, the request is refused. */
export const MAX_EMAIL_CHANGES_PER_HOUR = 3;

export interface EmailChangeLink {
  /** The new address: the link goes there, so only its owner can confirm. */
  to: string;
  link: string;
}

export type SendEmailChangeLink = (email: EmailChangeLink) => Promise<void>;

/** Tells the old address its account moved; it carries no link. */
export type SendEmailChangedNotice = (to: string) => Promise<void>;

export type EmailChangeRequest =
  /** `deliver` mails the link, or nothing when the address is taken. Run it after answering. */
  { ok: true; deliver: () => Promise<void> } | { ok: false; reason: "rate-limited" };

interface RequestOptions {
  now: number;
  /** Where the link points (see `authOrigin`). */
  origin: URL;
  send: SendEmailChangeLink;
}

async function isTaken(db: Queryable, email: string, userId: string): Promise<boolean> {
  // Deleted accounts keep their address (users.email is unique over every row).
  const { rows } = await db.query("SELECT 1 FROM users WHERE email = $1 AND id <> $2", [
    email,
    userId,
  ]);
  return rows.length > 0;
}

/**
 * Starts moving the user to `newEmail` (normalized, and not their current
 * one). Under a lock on the user, it counts their requests in the last hour
 * and refuses a fourth; otherwise it stores a one-hour link (its token's hash
 * only) and audits the request. Taken or not, the address gets a row, so the
 * count and the answer are the same either way; only a free one is mailed.
 */
export function requestEmailChange(
  db: Database,
  userId: string,
  newEmail: string,
  { now, origin, send }: RequestOptions,
): Promise<EmailChangeRequest> {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `squint:email-change:${userId}`,
    ]);
    // Links older than an hour are spent either way.
    await tx.query("DELETE FROM email_changes WHERE user_id = $1 AND created_at <= $2", [
      userId,
      new Date(now - EMAIL_CHANGE_TTL_MS),
    ]);
    const { rows } = await tx.query<{ count: string | number }>(
      "SELECT count(*) AS count FROM email_changes WHERE user_id = $1",
      [userId],
    );
    if (Number(rows[0]?.count ?? 0) >= MAX_EMAIL_CHANGES_PER_HOUR) {
      return { ok: false, reason: "rate-limited" } as const;
    }
    const token = createSecret();
    await tx.query(
      `INSERT INTO email_changes (user_id, new_email, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, newEmail, hashSecret(token), new Date(now), new Date(now + EMAIL_CHANGE_TTL_MS)],
    );
    await auditAccount(tx, userId, "user.email_change_requested", ["email"], now);
    const taken = await isTaken(tx, newEmail, userId);
    const link = new URL(`/email-change/${token}`, origin).href;
    return {
      ok: true,
      deliver: () => (taken ? Promise.resolve() : send({ to: newEmail, link })),
    } as const;
  });
}

/** Whether a link can still be confirmed: known, unused, unexpired, its user not deleted. */
export async function isEmailChangeUsable(
  db: Queryable,
  token: string,
  now: number,
): Promise<boolean> {
  if (!isSecretShape(token)) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM email_changes AS c JOIN users AS u ON u.id = c.user_id
     WHERE c.token_hash = $1 AND c.used_at IS NULL AND c.expires_at > $2
       AND u.deleted_at IS NULL`,
    [hashSecret(token), new Date(now)],
  );
  return rows.length === 1;
}

export type EmailChangeResult =
  { ok: true; oldEmail: string } | { ok: false; reason: "expired" | "taken" };

interface PendingChange {
  id: string;
  user_id: string;
  new_email: string;
  old_email: string;
}

/** A unique violation: another account got the address between the check and the update. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "23505";
}

async function applyChange(tx: Queryable, token: string, now: number): Promise<EmailChangeResult> {
  const { rows } = await tx.query<PendingChange>(
    `SELECT c.id, c.user_id, c.new_email, u.email AS old_email
     FROM email_changes AS c JOIN users AS u ON u.id = c.user_id
     WHERE c.token_hash = $1 AND c.used_at IS NULL AND c.expires_at > $2
       AND u.deleted_at IS NULL
     FOR UPDATE OF c, u`,
    [hashSecret(token), new Date(now)],
  );
  const change = rows[0];
  if (!change) return { ok: false, reason: "expired" };
  if (await isTaken(tx, change.new_email, change.user_id)) return { ok: false, reason: "taken" };
  const at = new Date(now);
  await tx.query("UPDATE users SET email = $2 WHERE id = $1", [change.user_id, change.new_email]);
  // This link, and every other one the user still had pending.
  await tx.query("UPDATE email_changes SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [
    change.user_id,
    at,
  ]);
  await tx.query("UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [
    change.user_id,
    at,
  ]);
  await tx.query("DELETE FROM sessions WHERE user_id = $1", [change.user_id]);
  await auditAccount(tx, change.user_id, "user.email_changed", ["email"], now);
  return { ok: true, oldEmail: change.old_email };
}

/**
 * Confirms an email change from its link, in one transaction: the address is
 * checked again (someone else may have taken it since the request), the user
 * moves to it, the link and their other pending ones are used up, their reset
 * links voided and every session of theirs ended, and the audit log records
 * it. `taken` changes nothing and leaves the link as it was. The caller sends
 * the notice to `oldEmail`.
 */
export async function confirmEmailChange(
  db: Database,
  token: string,
  now: number,
): Promise<EmailChangeResult> {
  if (!isSecretShape(token)) return { ok: false, reason: "expired" };
  try {
    return await db.transaction((tx) => applyChange(tx, token, now));
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "taken" };
    throw error;
  }
}
