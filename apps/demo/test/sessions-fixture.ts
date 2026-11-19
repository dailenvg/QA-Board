import type { SessionUser } from "@/lib/auth/users";
import type { Queryable } from "@/lib/share/migrate";
import { hashSecret, isSecretShape } from "@/lib/share/tokens";

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
