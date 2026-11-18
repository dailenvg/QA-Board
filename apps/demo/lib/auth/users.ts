import type { Queryable } from "../share/migrate";
import { openWorkspace } from "./memberships";

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
  /**
   * A company account whose every workspace is closed, at least one of them
   * suspended by the Squint admin (046): they can't sign in until it's lifted,
   * and the right password gets told so. Anyone with another open workspace
   * signs in as usual (and only opens that one); the admin never is.
   */
  suspended: boolean;
}

/**
 * The account belongs to a suspended workspace and to no open one. A
 * condition on `users`; never true for the admin, who belongs to none.
 */
const SUSPENDED_ONLY = `users.role = 'company'
  AND EXISTS (
    SELECT 1 FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
    WHERE m.user_id = users.id AND w.suspended_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM memberships AS m JOIN workspaces AS w ON w.id = m.workspace_id
    WHERE m.user_id = users.id AND ${openWorkspace("w")}
  )`;

/** `SUSPENDED_ONLY` for the account `userId`, on its own. */
export async function isSuspendedOnly(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM users WHERE id = $1 AND ${SUSPENDED_ONLY}`, [
    userId,
  ]);
  return rows.length === 1;
}

/**
 * In one lookup, so every email costs the same: a user who can sign in, or
 * else one removed from a workspace whose removal hasn't run its 24 hours
 * (`removed_from` is set only by a removal; `delete_after` still ahead). An
 * account deleted by its own user, or removed longer ago, is no one. Whether
 * it's held by a suspension comes with it. Null when there's none.
 */
export async function findSignInCandidate(
  db: Queryable,
  email: string,
  now: number,
): Promise<SignInCandidate | null> {
  const { rows } = await db.query<UserRow & { removed: boolean; suspended: boolean }>(
    `SELECT id, email, name, role, password_hash, deleted_at IS NOT NULL AS removed,
       (${SUSPENDED_ONLY}) AS suspended
     FROM users
     WHERE email = $1
       AND (deleted_at IS NULL OR (removed_from IS NOT NULL AND delete_after > $2))`,
    [email, new Date(now)],
  );
  const row = rows[0];
  if (!row) return null;
  const { removed, suspended, ...user } = row;
  return { user, removed, suspended };
}
