import { SESSION_TTL_MS } from "@/lib/auth/session-cookie";
import type { SessionUser } from "@/lib/auth/users";
import type { Queryable } from "@/lib/share/migrate";
import { createSecret, hashSecret, isSecretShape } from "@/lib/share/tokens";

/**
 * Sessions written and read straight in `sessions`, for tests whose subject
 * isn't how a session starts. The app starts and reads them through Better
 * Auth (`lib/auth/better-auth.ts`).
 */

/**
 * A session for `userId` until 30 days after `now`, as Squint wrote them
 * before Better Auth (its sha256 stored, the cookie the token itself; the app
 * reads it through the legacy bridge, `lib/auth/session-token.ts`, as
 * `e2e/auth-fixtures.ts`'s `sessionCookie` does). Returns the cookie's value.
 */
export async function insertSession(db: Queryable, userId: string, now: number): Promise<string> {
  const token = createSecret();
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashSecret(token),
    userId,
    new Date(now + SESSION_TTL_MS),
  ]);
  return token;
}

/**
 * Who a session cookie's value is signed in as at `now`, read straight from
 * `sessions` (nothing slides): a legacy token by its sha256, a signed one by
 * the token before its signature. Null for no live session or a deleted user.
 * For tests of what ends sessions; the app reads them through Better Auth
 * (`lib/auth/guards.ts`), whose clock is the real one.
 */
export async function readSession(
  db: Queryable,
  value: string,
  now: number,
): Promise<SessionUser | null> {
  const dot = value.lastIndexOf(".");
  const token = isSecretShape(value) ? hashSecret(value) : dot > 0 ? value.slice(0, dot) : null;
  if (!token) return null;
  const { rows } = await db.query<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role
     FROM sessions AS s JOIN users AS u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.deleted_at IS NULL`,
    [token, new Date(now)],
  );
  return rows[0] ?? null;
}
