import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 027: the schema production had when Milestone 2's guest pages shipped. */
const UP_TO_026 = MIGRATIONS.slice(0, 26);
const NEW = ["027_email_changes", "028_users_name_length"];

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const databases: Array<[string, () => Promise<Database>]> = [
  ["PGlite", () => Promise.resolve(adaptPglite(new PGlite()))],
  ...(TEST_DATABASE_URL
    ? [
        [
          "Postgres",
          async () => {
            const fresh = await freshSchema(TEST_DATABASE_URL as string);
            closers.push(() => fresh.close());
            return fresh.db;
          },
        ] as [string, () => Promise<Database>],
      ]
    : []),
];

const HASH = "a".repeat(64);

async function insertUser(db: Database, email: string, name: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1, 'x', $2, 'company') RETURNING id",
    [email, name],
  );
  return rows[0]?.id ?? "";
}

describe.each(databases)("migrations 027 and 028 (%s)", (_name, make) => {
  it("apply over a legacy name longer than 80 characters, and leave it alone", async () => {
    const db = await make();
    await migrate(db, UP_TO_026);
    const legacy = await insertUser(db, "legacy@acme.test", "L".repeat(120));
    expect(await migrate(db)).toEqual(NEW);
    expect(await migrate(db)).toEqual([]);
    // Run again by hand: the guarded DO block and IF NOT EXISTS make them safe to repeat.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    const { rows } = await db.query<{ name: string }>("SELECT name FROM users WHERE id = $1", [
      legacy,
    ]);
    expect(rows[0]?.name).toHaveLength(120);
  });

  it("checks names written from now on: 1 to 80 characters once trimmed, or none", async () => {
    const db = await make();
    await migrate(db);
    const id = await insertUser(db, "ana@acme.test", null);
    const rename = (name: string | null) =>
      db.query("UPDATE users SET name = $2 WHERE id = $1", [id, name]);
    await rename("A".repeat(80));
    await rename("  Ana  ");
    await rename(null);
    await expect(rename("A".repeat(81))).rejects.toThrow(/users_name_length/);
    await expect(rename("   ")).rejects.toThrow(/users_name_length/);
    await expect(insertUser(db, "bo@acme.test", "")).rejects.toThrow(/users_name_length/);
  });

  it("keeps email changes' addresses normalized and their tokens hashed and unique", async () => {
    const db = await make();
    await migrate(db);
    const userId = await insertUser(db, "ana@acme.test", null);
    const insert = (email: string, hash = HASH) =>
      db.query(
        `INSERT INTO email_changes (user_id, new_email, token_hash, expires_at)
         VALUES ($1, $2, $3, now() + interval '1 hour')`,
        [userId, email, hash],
      );
    await insert("new@acme.test");
    await expect(insert("other@acme.test")).rejects.toThrow(/duplicate key|unique/);
    await expect(insert("New@Acme.test", "b".repeat(64))).rejects.toThrow(/check/i);
    await expect(insert(" new@acme.test", "b".repeat(64))).rejects.toThrow(/check/i);
    await expect(insert("not-an-email", "b".repeat(64))).rejects.toThrow(/check/i);
    await expect(insert("new@acme.test", "not-a-hash")).rejects.toThrow(/check/i);
    // Deleting the user deletes their pending changes.
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    expect((await db.query("SELECT 1 FROM email_changes")).rows).toEqual([]);
  });
});
