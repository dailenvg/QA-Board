import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 031: the schema production had when the Overview bento shipped. */
const UP_TO_030 = MIGRATIONS.slice(0, 30);
const NEW = ["031_comments_origin"];

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

/** A database at 030 with a member and a project, and a comment by each `author` (null: a guest's). */
async function at030(make: () => Promise<Database>, authors: Record<string, "member" | null>) {
  const db = await make();
  expect(await migrate(db, UP_TO_030)).toHaveLength(30);
  const { rows: users } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
  );
  const userId = users[0]?.id ?? "";
  const { rows: workspaces } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = workspaces[0]?.id ?? "";
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [workspaceId],
  );
  for (const [id, author] of Object.entries(authors)) {
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id)
       VALUES ('p1', $1, 1, 1, 'Hi', 'Ana', $2)`,
      [id, author === "member" ? userId : null],
    );
  }
  return { db, userId };
}

async function origins(db: Database): Promise<Record<string, string>> {
  const { rows } = await db.query<{ id: string; origin: string }>(
    "SELECT id, origin FROM comments ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.origin]));
}

describe.each(databases)("migration 031 (%s)", (_name, make) => {
  it("labels existing comments as they show today: no author account, a client's", async () => {
    const { db } = await at030(make, { mine: "member", guest: null });
    expect(await migrate(db)).toEqual(NEW);
    expect(await origins(db)).toEqual({ guest: "client", mine: "team" });
    // New comments default to the team's, and nothing else is allowed.
    await db.query(
      "INSERT INTO comments (project_id, id, x, y, body, author_name) VALUES ('p1', 'later', 1, 1, 'Hi', 'Bo')",
    );
    expect((await origins(db)).later).toBe("team");
    await expect(
      db.query(
        "INSERT INTO comments (project_id, id, x, y, body, author_name, origin) VALUES ('p1', 'bad', 1, 1, 'Hi', 'Bo', 'robot')",
      ),
    ).rejects.toThrow();
  });

  it("never relabels a comment when it runs again, even after its author's account is deleted", async () => {
    const { db, userId } = await at030(make, { mine: "member", guest: null });
    await migrate(db);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    expect(await migrate(db)).toEqual([]);
    // By hand too: the column is there, so the guarded block skips the backfill.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    expect(await origins(db)).toEqual({ guest: "client", mine: "team" });
  });
});
