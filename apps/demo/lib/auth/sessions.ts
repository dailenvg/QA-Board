import { voidEmailChanges } from "../account/email-change";
import type { Queryable } from "../share/migrate";
import { createSecret, hashSecret } from "../share/tokens";
import { SESSION_TTL_MS } from "./session-cookie";

/**
 * The sessions Squint still starts itself, in the same transaction as the
 * change behind them (accepting an invite, a password change), and ends with
 * a user's other rows. Sign-in, reading a session and sign-out run on Better
 * Auth (`better-auth.ts`), which reads these rows through the legacy cookie
 * bridge (`session-token.ts`).
 */

/**
 * Starts a session for `userId` and returns the cookie's token (shown only
 * here; the table keeps its sha256). Clears the user's expired sessions on the way.
 */
export async function createSession(db: Queryable, userId: string, now: number): Promise<string> {
  const token = createSecret();
  await db.query("DELETE FROM sessions WHERE user_id = $1 AND expires_at <= $2", [
    userId,
    new Date(now),
  ]);
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashSecret(token),
    userId,
    new Date(now + SESSION_TTL_MS),
  ]);
  return token;
}

/** Signs the user out everywhere ("log out everywhere", an admin reset). Returns how many. */
export async function deleteUserSessions(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query("DELETE FROM sessions WHERE user_id = $1 RETURNING user_id", [
    userId,
  ]);
  return rows.length;
}

/**
 * After a password change: ends every session of the user, voids their unused
 * reset links and pending email changes (a link from before the change can't
 * undo it or take the account), and returns a fresh token for the browser that
 * made the change, so it stays signed in.
 */
export async function rotateSessions(db: Queryable, userId: string, now: number): Promise<string> {
  await deleteUserSessions(db, userId);
  await db.query("UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [
    userId,
    new Date(now),
  ]);
  await voidEmailChanges(db, userId, now);
  return createSession(db, userId, now);
}
