import { hashPassword } from "@/lib/auth/password";
import type { Queryable } from "@/lib/share/migrate";

export const PASSWORD = "correct horse battery";

/** 2026-11-02T12:00:00Z: real epoch ms, as `Date.now()` gives. */
export const NOW = Date.UTC(2026, 10, 2, 12);

/** Inserts a user with `PASSWORD` (hashed once per call) and returns its id. */
export async function insertUser(
  db: Queryable,
  email: string,
  role: "admin" | "company" = "company",
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
    [email, await hashPassword(PASSWORD), role],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("no user");
  return id;
}
