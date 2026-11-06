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
