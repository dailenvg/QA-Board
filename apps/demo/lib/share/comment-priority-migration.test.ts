import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_054 = MIGRATIONS.slice(0, 54);
const NEW = ["055_comment_priority"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_055 = MIGRATIONS.slice(0, 54 + NEW.length);

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

/** A database at 054 with two workspace comments. */
async function at054(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_054)).toHaveLength(54);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [rows[0]?.id],
  );
  for (const id of ["c1", "c2"]) {
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name)
       VALUES ('p1', $1, 1, 1, 'Hi', 'Ana')`,
      [id],
    );
  }
  return db;
}

async function priorities(db: Database): Promise<Record<string, unknown>> {
  const { rows } = await db.query<{ id: string; priority: unknown }>(
    "SELECT id, priority FROM comments ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.priority]));
}

describe.each(databases)("migration 055 (%s)", (_name, make) => {
  it("leaves every existing comment without a priority", async () => {
    const db = await at054(make);
    expect(await migrate(db, UP_TO_055)).toEqual(NEW);
    expect(await priorities(db)).toEqual({ c1: null, c2: null });
  });

  it("takes must, should, nit and none, and refuses anything else", async () => {
    const db = await at054(make);
    await migrate(db, UP_TO_055);
    for (const priority of ["must", "should", "nit", null]) {
      await db.query("UPDATE comments SET priority = $1 WHERE id = 'c1'", [priority]);
      expect((await priorities(db)).c1).toBe(priority);
    }
    for (const priority of ["Must", "high", "", "none"]) {
      await expect(
        db.query("UPDATE comments SET priority = $1 WHERE id = 'c1'", [priority]),
        priority,
      ).rejects.toThrow();
    }
  });

  it("changes nothing when it runs again", async () => {
    const db = await at054(make);
    await migrate(db, UP_TO_055);
    await db.query("UPDATE comments SET priority = 'must' WHERE id = 'c1'");
    expect(await migrate(db, UP_TO_055)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect(await priorities(db)).toEqual({ c1: "must", c2: null });
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_constraint
       WHERE conname = 'comments_priority_check' AND conrelid = 'comments'::regclass`,
    );
    expect(rows[0]?.count).toBe(1);
    await expect(db.query("UPDATE comments SET priority = 'urgent'")).rejects.toThrow();
  });
});
