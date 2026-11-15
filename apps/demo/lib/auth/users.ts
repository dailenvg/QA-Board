import type { Queryable } from "../share/migrate";

export type UserRole = "admin" | "company";

/** Who is signed in. Never carries the password hash. */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  password_hash: string;
}

export function toSessionUser({ id, email, name, role }: UserRow): SessionUser {
  return { id, email, name, role };
}

/** A user who can sign in (not deleted), by normalized email; null when there's none. */
export async function findActiveUser(db: Queryable, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `SELECT id, email, name, role, password_hash FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

/** Who a sign-in with this email checks the password of, and whether they were removed. */
export interface SignInCandidate {
  user: UserRow;
  /**
   * Removed from their workspace by its owner (or a member with the people
   * switch) less than 24 hours ago: they can't sign in, but the right
   * password gets told why (decision 20).
   */
  removed: boolean;
}

/**
 * In one lookup, so every email costs the same: a user who can sign in, or
 * else one removed from a workspace whose removal hasn't run its 24 hours
 * (`removed_from` is set only by a removal; `delete_after` still ahead). An
 * account deleted by its own user, or removed longer ago, is no one. Null
 * when there's none.
 */
export async function findSignInCandidate(
  db: Queryable,
  email: string,
  now: number,
): Promise<SignInCandidate | null> {
  const { rows } = await db.query<UserRow & { removed: boolean }>(
    `SELECT id, email, name, role, password_hash, deleted_at IS NOT NULL AS removed FROM users
     WHERE email = $1
       AND (deleted_at IS NULL OR (removed_from IS NOT NULL AND delete_after > $2))`,
    [email, new Date(now)],
  );
  const row = rows[0];
  if (!row) return null;
  const { removed, ...user } = row;
  return { user, removed };
}
