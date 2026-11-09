import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { recordLogin } from "../auth/login";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 027: the schema production had when Milestone 2's guest pages shipped. */
const UP_TO_026 = MIGRATIONS.slice(0, 26);
const NEW = ["027_email_changes", "028_users_name_length"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_028 = MIGRATIONS.slice(0, 26 + NEW.length);

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
  it("put legacy names right, so every user can still be updated (and sign in)", async () => {
    const db = await make();
    await migrate(db, UP_TO_026);
    // Name before 028, and what it becomes.
    const cases: Array<[string | null, string | null]> = [
      ["L".repeat(120), "L".repeat(80)],
      ["   ", null],
      ["", null],
      // The cut ends on a space: trimmed again, so it passes the check.
      [`  ${"a".repeat(79)} ${"b".repeat(10)}  `, "a".repeat(79)],
      // Already fine once trimmed: left as it is.
      ["  Ana Lima  ", "  Ana Lima  "],
      ["😀".repeat(80), "😀".repeat(80)],
      [null, null],
    ];
    const ids: string[] = [];
    for (const [index, [name]] of cases.entries()) {
      ids.push(await insertUser(db, `legacy-${index}@acme.test`, name));
    }
    expect(await migrate(db, UP_TO_028)).toEqual(NEW);
    expect(await migrate(db, UP_TO_028)).toEqual([]);
    // Run again by hand: the UPDATE finds nothing left, and the guarded DO block skips.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }

    for (const [index, [, expected]] of cases.entries()) {
      const id = ids[index];
      // A sign-in stamps last_login_at: this must not trip the check.
      expect(await recordLogin(db, id ?? "", Date.now()), String(index)).toBe(true);
      const { rows } = await db.query<{ name: string | null }>(
        "SELECT name FROM users WHERE id = $1",
        [id],
      );
      expect(rows[0]?.name, String(index)).toBe(expected);
    }
    const { rows } = await db.query<{ convalidated: boolean }>(
      "SELECT convalidated FROM pg_constraint WHERE conname = 'users_name_length' AND conrelid = 'users'::regclass",
    );
    expect(rows).toEqual([{ convalidated: true }]);
  });

  it("validates the check where an earlier draft added it NOT VALID", async () => {
    const db = await make();
    await migrate(db, MIGRATIONS.slice(0, 27));
    await db.query(
      `ALTER TABLE users ADD CONSTRAINT users_name_length
         CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80) NOT VALID`,
    );
    await migrate(db);
    const { rows } = await db.query<{ convalidated: boolean }>(
      "SELECT convalidated FROM pg_constraint WHERE conname = 'users_name_length' AND conrelid = 'users'::regclass",
    );
    expect(rows).toEqual([{ convalidated: true }]);
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
