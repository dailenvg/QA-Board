import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_056 = MIGRATIONS.slice(0, 56);
const NEW = ["057_team_only"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_057 = MIGRATIONS.slice(0, 56 + NEW.length);

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

/** A database at 056 with a team comment, a client comment, and a reply of each origin. */
async function at056(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_056)).toHaveLength(56);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [rows[0]?.id],
  );
  for (const [id, origin] of [
    ["c1", "team"],
    ["c2", "client"],
  ]) {
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name, origin)
       VALUES ('p1', $1, 1, 1, 'Hi', 'Ana', $2)`,
      [id, origin],
    );
  }
  for (const [id, origin] of [
    ["r1", "team"],
    ["r2", "client"],
  ]) {
    await db.query(
      `INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, origin)
       VALUES ('p1', 'c1', $1, 'Yes', 'Ben', $2)`,
      [id, origin],
    );
  }
  return db;
}

async function flags(db: Database, table: "comments" | "comment_replies") {
  const { rows } = await db.query<{ id: string; team_only: unknown }>(
    `SELECT id, team_only FROM ${table} ORDER BY id`,
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.team_only]));
}

describe.each(databases)("migration 057 (%s)", (_name, make) => {
  it("leaves every existing comment and reply visible to clients", async () => {
    const db = await at056(make);
    expect(await migrate(db, UP_TO_057)).toEqual(NEW);
    expect(await flags(db, "comments")).toEqual({ c1: false, c2: false });
    expect(await flags(db, "comment_replies")).toEqual({ r1: false, r2: false });
  });

  it("lets the team's comments and replies be team only, and never a client's", async () => {
    const db = await at056(make);
    await migrate(db, UP_TO_057);
    await db.query("UPDATE comments SET team_only = true WHERE id = 'c1'");
    await db.query("UPDATE comment_replies SET team_only = true WHERE id = 'r1'");
    expect((await flags(db, "comments")).c1).toBe(true);
    expect((await flags(db, "comment_replies")).r1).toBe(true);
    await expect(
      db.query("UPDATE comments SET team_only = true WHERE id = 'c2'"),
    ).rejects.toThrow();
    await expect(
      db.query("UPDATE comment_replies SET team_only = true WHERE id = 'r2'"),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO comments (project_id, id, x, y, body, author_name, origin, team_only)
         VALUES ('p1', 'c3', 1, 1, 'Hi', 'Guest', 'client', true)`,
      ),
    ).rejects.toThrow();
  });

  it("changes nothing when it runs again", async () => {
    const db = await at056(make);
    await migrate(db, UP_TO_057);
    await db.query("UPDATE comments SET team_only = true WHERE id = 'c1'");
    expect(await migrate(db, UP_TO_057)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect(await flags(db, "comments")).toEqual({ c1: true, c2: false });
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_constraint
       WHERE conname IN ('comments_team_only_origin', 'comment_replies_team_only_origin')`,
    );
    expect(rows[0]?.count).toBe(2);
    await expect(db.query("UPDATE comments SET team_only = true")).rejects.toThrow();
  });
});
