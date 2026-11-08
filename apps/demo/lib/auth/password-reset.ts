import type { Queryable } from "../share/migrate";
import { createSecret, hashSecret, isSecretShape } from "../share/tokens";
import { normalizeEmail } from "./field-rules";
import { hashPassword } from "./password";
import { findActiveUser } from "./users";

/** A reset link works for one hour, once. */
export const RESET_TTL_MS = 60 * 60 * 1000;
/** At most this many links per account per hour; requests past it send nothing. */
export const MAX_RESETS_PER_HOUR = 3;

export interface ResetEmail {
  to: string;
  link: string;
}

export type SendResetEmail = (email: ResetEmail) => Promise<void>;

interface RequestOptions {
  now: number;
  /** Where the link points (see `authOrigin`). */
  origin: URL;
  send: SendResetEmail;
}

/**
 * Emails a reset link when `email` belongs to an account that can sign in,
 * and nothing otherwise. The caller answers the same either way. Only the
 * token's hash is stored.
 */
export async function requestPasswordReset(
  db: Queryable,
  email: string,
  { now, origin, send }: RequestOptions,
): Promise<void> {
  const user = await findActiveUser(db, normalizeEmail(email));
  if (!user) return;
  const windowStart = new Date(now - RESET_TTL_MS);
  // Links older than an hour are spent either way.
  await db.query("DELETE FROM password_resets WHERE user_id = $1 AND created_at <= $2", [
    user.id,
    windowStart,
  ]);
  const { rows } = await db.query<{ count: string | number }>(
    "SELECT count(*) AS count FROM password_resets WHERE user_id = $1",
    [user.id],
  );
  if (Number(rows[0]?.count ?? 0) >= MAX_RESETS_PER_HOUR) return;

  const token = createSecret();
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, created_at, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, hashSecret(token), new Date(now), new Date(now + RESET_TTL_MS)],
  );
  await send({ to: user.email, link: new URL(`/reset/${token}`, origin).href });
}

/** Whether a link can still set a password: known, unused, unexpired, its user not deleted. */
export async function isResetTokenUsable(
  db: Queryable,
  token: string,
  now: number,
): Promise<boolean> {
  if (!isSecretShape(token)) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM password_resets AS r JOIN users AS u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > $2
       AND u.deleted_at IS NULL`,
    [hashSecret(token), new Date(now)],
  );
  return rows.length === 1;
}

/**
 * Sets the password through a reset link, in one statement: the link is used
 * up, the user's other links too, and their pending email changes (one asked
 * for with the old password can't take the account afterwards), every session
 * of theirs ends (so a stolen session dies with the old password), and the
 * audit log records it. False when the link can't be used.
 */
export async function completePasswordReset(
  db: Queryable,
  token: string,
  password: string,
  now: number,
): Promise<boolean> {
  if (!(await isResetTokenUsable(db, token, now))) return false;
  const passwordHash = await hashPassword(password);
  const { rows } = await db.query(
    `WITH used AS (
       UPDATE password_resets SET used_at = $3
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $3
       RETURNING user_id
     ), changed AS (
       UPDATE users SET password_hash = $2
       FROM used WHERE users.id = used.user_id AND users.deleted_at IS NULL
       RETURNING users.id
     ), other_links AS (
       UPDATE password_resets SET used_at = $3
       WHERE user_id IN (SELECT id FROM changed) AND used_at IS NULL AND token_hash <> $1
     ), email_changes_voided AS (
       UPDATE email_changes SET used_at = $3
       WHERE user_id IN (SELECT id FROM changed) AND used_at IS NULL
     ), signed_out AS (
       DELETE FROM sessions WHERE user_id IN (SELECT id FROM changed)
     ), audit AS (
       INSERT INTO audit_log (actor_user_id, action, target_type, target_id)
       SELECT id, 'user.password_reset', 'user', id::text FROM changed
     )
     SELECT id FROM changed`,
    [hashSecret(token), passwordHash, new Date(now)],
  );
  return rows.length === 1;
}
