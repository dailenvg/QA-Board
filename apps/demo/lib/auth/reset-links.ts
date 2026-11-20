import type { Queryable } from "../share/migrate";
import { hashSecret } from "../share/tokens";

/**
 * Reset links as Better Auth stores them (049): `verifications` rows whose
 * `value` is the user's id. Better Auth is handed `reset-password:<secret>`
 * and stores only what `storedIdentifier` makes of it. No Better Auth import
 * here, so the admin's transaction can write a link in SQL that Better Auth
 * then finds.
 */

/** What Better Auth calls a reset link's identifier, before it's stored. */
const RESET_PREFIX = "reset-password";

/**
 * What Better Auth stores for `identifier` (its `verification.storeIdentifier`
 * hash): `sha256:`, the readable kind (`reset-password:`), and the sha256 of
 * the secret after it, as `password_resets.token_hash` held it. The stored
 * form never starts with the kind itself, so Better Auth's fallback lookup of
 * a presented identifier in plain text can't match a stored row with a hash
 * read out of the database.
 */
export function storedIdentifier(identifier: string): string {
  const colon = identifier.indexOf(":");
  const kind = colon === -1 ? "" : identifier.slice(0, colon + 1);
  return `sha256:${kind}${hashSecret(identifier.slice(colon + 1))}`;
}

/** The identifier Better Auth looks a reset link's `token` up by. */
export function resetIdentifier(token: string): string {
  return `${RESET_PREFIX}:${token}`;
}

/** How every reset link's stored identifier starts (`storedIdentifier`). */
const STORED_RESET_PREFIX = `sha256:${RESET_PREFIX}:`;

/** The stored identifier of the reset link for `token`. */
export function storedResetIdentifier(token: string): string {
  return storedIdentifier(resetIdentifier(token));
}

/** The SQL condition that `column` is a reset link's stored identifier. */
export function isResetLink(column: string): string {
  return `starts_with(${column}, '${STORED_RESET_PREFIX}')`;
}

/** Deletes every reset link of `userId`: emailed and the admin's, used up either way. */
export async function voidResetLinks(db: Queryable, userId: string): Promise<void> {
  await db.query(`DELETE FROM verifications WHERE value = $1 AND ${isResetLink("identifier")}`, [
    userId,
  ]);
}
