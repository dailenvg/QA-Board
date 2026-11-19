import { isAPIError } from "better-auth/api";
import { voidEmailChanges } from "../account/email-change";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { createSecret, isSecretShape } from "../share/tokens";
import { authFor } from "./better-auth";
import { normalizeEmail } from "./field-rules";
import { isResetLink, resetIdentifier, storedResetIdentifier } from "./reset-links";
import { findActiveUser } from "./users";

/**
 * Password reset links, on Better Auth's verification model (049): a link is
 * a `verifications` row, used once by Better Auth's `resetPassword`. Squint
 * keeps the rest: who gets a link, the hourly cap, the admin's links, the
 * link's address and email. Better Auth's `requestPasswordReset` isn't used:
 * its email check refuses addresses Squint accepts (`jürgen@firma.de`).
 */

/** A reset link works for one hour, once. */
export const RESET_TTL_MS = 60 * 60 * 1000;
/**
 * At most this many open emailed links per account; requests past it send
 * nothing. A link stops counting once it's used (Better Auth deletes it) or
 * its hour is up. Links the admin made (`createResetLink`) don't count.
 */
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

/** Where a reset token's link points: `/reset/<token>` on `origin`. */
function resetLinkOf(token: string, origin: URL): string {
  return new URL(`/reset/${token}`, origin).href;
}

/** How many of the user's emailed links are still open at `now`. */
async function openEmailedLinks(db: Queryable, userId: string, now: number): Promise<number> {
  const { rows } = await db.query<{ count: string | number }>(
    `SELECT count(*) AS count FROM verifications
     WHERE value = $1 AND ${isResetLink("identifier")} AND NOT by_admin AND expires_at > $2`,
    [userId, new Date(now)],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Emails a reset link when `email` belongs to an account that can sign in,
 * and nothing otherwise. The caller answers the same either way. Better Auth
 * stores the link, keeping only the token's hash.
 */
export async function requestPasswordReset(
  db: Database,
  email: string,
  { now, origin, send }: RequestOptions,
): Promise<void> {
  const user = await findActiveUser(db, normalizeEmail(email));
  if (!user) return;
  if ((await openEmailedLinks(db, user.id, now)) >= MAX_RESETS_PER_HOUR) return;

  const token = createSecret();
  const { internalAdapter } = await authFor(db).$context;
  await internalAdapter.createVerificationValue({
    identifier: resetIdentifier(token),
    value: user.id,
    expiresAt: new Date(now + RESET_TTL_MS),
  });
  await send({ to: user.email, link: resetLinkOf(token, origin) });
}

/** A reset link made to be handed over, not emailed. */
export interface ResetLink {
  link: string;
  /** When it stops working (epoch ms): `RESET_TTL_MS` after it was made. */
  expiresAt: number;
}

/**
 * A reset link for `userId`, made by the Squint admin for a workspace owner
 * and returned instead of emailed: the admin passes it on. The same link as
 * an emailed one (one hour, once; `completePasswordReset` sets the password),
 * outside the hourly cap on emails, which guards an inbox the admin isn't
 * sending to, and never counted by it. Only the newest admin link works: the
 * owner's earlier unused ones are voided (their emailed ones are kept). Null
 * when the account is deleted. Written in SQL on `tx`, the admin's
 * transaction, as Better Auth would store it (`storedResetIdentifier`). The
 * caller shows it once and never logs or records it.
 */
export async function createResetLink(
  tx: Queryable,
  userId: string,
  { now, origin }: { now: number; origin: URL },
): Promise<ResetLink | null> {
  await tx.query(
    `DELETE FROM verifications WHERE value = $1 AND ${isResetLink("identifier")} AND by_admin`,
    [userId],
  );
  const token = createSecret();
  const expiresAt = now + RESET_TTL_MS;
  const { rows } = await tx.query(
    `INSERT INTO verifications (identifier, value, expires_at, by_admin)
     SELECT $2, id::text, $3, true FROM users WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [userId, storedResetIdentifier(token), new Date(expiresAt)],
  );
  return rows.length === 1 ? { link: resetLinkOf(token, origin), expiresAt } : null;
}

/** Whether a link can still set a password: known, unexpired, its user not deleted. */
export async function isResetTokenUsable(
  db: Queryable,
  token: string,
  now: number,
): Promise<boolean> {
  if (!isSecretShape(token)) return false;
  const { rows } = await db.query(
    `SELECT 1 FROM verifications AS v JOIN users AS u ON u.id::text = v.value
     WHERE v.identifier = $1 AND v.expires_at > $2 AND u.deleted_at IS NULL`,
    [storedResetIdentifier(token), new Date(now)],
  );
  return rows.length === 1;
}

/** Better Auth's answers for a link it can't use (unknown, used, expired, its user gone). */
const UNUSABLE_LINK_CODES = new Set(["INVALID_TOKEN", "USER_NOT_FOUND"]);

function isUnusableLink(error: unknown): boolean {
  if (!isAPIError(error)) return false;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && UNUSABLE_LINK_CODES.has(code);
}

/**
 * Readies a reset with `token`, in one transaction: once its link is known to
 * be open (unexpired, its user not deleted; locked against another use at
 * once), the user's other reset links and pending email changes are voided,
 * so none outlives the reset (one asked for with the old password can't take
 * the account afterwards). The user's id; null, voiding nothing, when the
 * link can't be used, so a bad token never touches anyone's links.
 */
async function voidAllButLink(db: Database, token: string, now: number): Promise<string | null> {
  if (!isSecretShape(token)) return null;
  const stored = storedResetIdentifier(token);
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ user_id: string }>(
      `SELECT u.id AS user_id FROM verifications AS v JOIN users AS u ON u.id::text = v.value
       WHERE v.identifier = $1 AND v.expires_at > $2 AND u.deleted_at IS NULL
       FOR UPDATE OF v`,
      [stored, new Date(now)],
    );
    const userId = rows[0]?.user_id;
    if (!userId) return null;
    await tx.query(
      `DELETE FROM verifications
       WHERE value = $1 AND ${isResetLink("identifier")} AND identifier <> $2`,
      [userId, stored],
    );
    await voidEmailChanges(tx, userId, now);
    return userId;
  });
}

/**
 * Sets the password through a reset link. First (`voidAllButLink`) the
 * user's other links and pending email changes are voided; then Better
 * Auth's `resetPassword`, in one transaction, uses the link up, ends every
 * session of the user (so a stolen session dies with the old password) and
 * sets the password, and (`onPasswordReset`) the audit log records it. If
 * the reset then fails, the voiding stands: it only took the user's own
 * spare links and email changes, and this link still works for a retry.
 * False when the link can't be used. Only a well-formed token reaches
 * Better Auth.
 */
export async function completePasswordReset(
  db: Database,
  token: string,
  password: string,
  now: number,
): Promise<boolean> {
  if (!(await voidAllButLink(db, token, now))) return false;
  try {
    await authFor(db).api.resetPassword({ body: { token, newPassword: password } });
    return true;
  } catch (error) {
    if (isUnusableLink(error)) return false;
    throw error;
  }
}
