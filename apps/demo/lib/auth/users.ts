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

/** The fields of Better Auth's user (`lib/auth/better-auth.ts`) a session reads. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  deletedAt?: Date | null;
}

const ROLES: readonly string[] = ["admin", "company"] satisfies UserRole[];

/** Who Better Auth's user is signed in as; null for a deleted user, or a role Squint doesn't know. */
export function sessionUserOf({ id, email, name, role, deletedAt }: AuthUser): SessionUser | null {
  if (deletedAt || !ROLES.includes(role)) return null;
  return { id, email, name: name ?? null, role: role as UserRole };
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

/** Whose password a sign-in checks: their row, deleted or not, and their hash. */
export interface SignInAccount extends AuthUser {
  passwordHash: string;
}

/**
 * The account a sign-in with this (normalized) email checks the password of,
 * deleted or not (the sign-in hold decides who may have a session), or null.
 * Any email Squint stores can be looked up: no format check here.
 */
export async function findSignInAccount(
  db: Queryable,
  email: string,
): Promise<SignInAccount | null> {
  const { rows } = await db.query<SignInAccount>(
    `SELECT id, email, name, role, deleted_at AS "deletedAt", password_hash AS "passwordHash"
     FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
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

/**
 * Why `userId`, whose password was just confirmed, can't have a session; null
 * when they can. `removed`: removed from a workspace less than 24 hours ago
 * (`removed_from` is set only by a removal; `delete_after` still ahead), told
 * so (decision 20). `suspended`: every workspace closed, one of them
 * suspended by the Squint admin (046). `gone`: deleted by its own user, or
 * removed longer ago (or no such user), answered as a wrong password.
 */
export type SignInHold = "removed" | "suspended" | "gone";

export async function signInHold(
  db: Queryable,
  userId: string,
  now: number,
): Promise<SignInHold | null> {
  const { rows } = await db.query<{ deleted: boolean; removed: boolean; suspended: boolean }>(
    `SELECT deleted_at IS NOT NULL AS deleted,
       (removed_from IS NOT NULL AND delete_after > $2) AS removed,
       (${SUSPENDED_ONLY}) AS suspended
     FROM users WHERE id = $1`,
    [userId, new Date(now)],
  );
  const row = rows[0];
  if (!row) return "gone";
  if (row.deleted) return row.removed ? "removed" : "gone";
  return row.suspended ? "suspended" : null;
}
