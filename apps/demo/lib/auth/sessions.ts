import type { Queryable } from "../share/migrate";
import { createSecret, hashSecret, isSecretShape } from "../share/tokens";
import { SESSION_TTL_MS } from "./session-cookie";
import type { SessionUser, UserRole } from "./users";

/** A session's expiry slides forward at most this often, so most requests only read. */
export const SESSION_SLIDE_MS = 24 * 60 * 60 * 1000;

interface SessionRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  expires_at: Date;
}

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

/**
 * The signed-in user for a cookie's token, or null when the token is unknown,
 * expired, or its user deleted. Use moves the expiry to 30 days from now
 * (written at most once per `SESSION_SLIDE_MS`).
 */
export async function readSession(
  db: Queryable,
  token: string,
  now: number,
): Promise<SessionUser | null> {
  if (!isSecretShape(token)) return null;
  const tokenHash = hashSecret(token);
  const { rows } = await db.query<SessionRow>(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at
     FROM sessions AS s JOIN users AS u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.deleted_at IS NULL`,
    [tokenHash, new Date(now)],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < now + SESSION_TTL_MS - SESSION_SLIDE_MS) {
    await db.query("UPDATE sessions SET expires_at = $2 WHERE token_hash = $1", [
      tokenHash,
      new Date(now + SESSION_TTL_MS),
    ]);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Signs one browser out. Unknown tokens are ignored. */
export async function deleteSession(db: Queryable, token: string): Promise<void> {
  if (!isSecretShape(token)) return;
  await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashSecret(token)]);
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
 * reset links (a link mailed before the change can't undo it), and returns a
 * fresh token for the browser that made the change, so it stays signed in.
 */
export async function rotateSessions(db: Queryable, userId: string, now: number): Promise<string> {
  await deleteUserSessions(db, userId);
  await db.query("UPDATE password_resets SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL", [
    userId,
    new Date(now),
  ]);
  return createSession(db, userId, now);
}
