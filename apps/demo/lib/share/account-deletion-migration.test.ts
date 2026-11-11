import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 033: the schema production had when archived projects got a delete date. */
const UP_TO_032 = MIGRATIONS.slice(0, 32);
const NEW = ["033_account_deletion"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_033 = MIGRATIONS.slice(0, 32 + NEW.length);

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

/** A database at 032 with one live user and one workspace. */
async function at032(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_032)).toHaveLength(32);
  await db.query(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company')",
  );
  await db.query("INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme')");
  return db;
}

describe.each(databases)("migration 033 (%s)", (_name, make) => {
  it("adds empty delete dates, and only a deleted user can have one", async () => {
    const db = await at032(make);
    expect(await migrate(db, UP_TO_033)).toEqual(NEW);
    const { rows } = await db.query<{ user: Date | null; workspace: Date | null }>(
      `SELECT u.delete_after AS user, w.delete_after AS workspace FROM users AS u, workspaces AS w`,
    );
    expect(rows).toEqual([{ user: null, workspace: null }]);
    await expect(
      db.query("UPDATE users SET delete_after = now() + interval '30 days'"),
    ).rejects.toThrow();
    await db.query(
      "UPDATE users SET deleted_at = now(), delete_after = now() + interval '30 days'",
    );
    await db.query("UPDATE workspaces SET delete_after = now() + interval '30 days'");
  });

  it("changes nothing when it runs again, by the runner or by hand", async () => {
    const db = await at032(make);
    await migrate(db, UP_TO_033);
    await db.query("UPDATE users SET deleted_at = now(), delete_after = now()");
    expect(await migrate(db, UP_TO_033)).toEqual([]);
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users WHERE delete_after IS NOT NULL",
    );
    expect(rows).toEqual([{ count: 1 }]);
    const { rows: constraints } = await db.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'users_delete_after_deleted'",
    );
    expect(constraints).toHaveLength(1);
  });
});
