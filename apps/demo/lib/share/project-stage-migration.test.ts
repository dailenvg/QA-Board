import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_055 = MIGRATIONS.slice(0, 55);
const NEW = ["056_project_stage"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_056 = MIGRATIONS.slice(0, 55 + NEW.length);

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

/** A database at 055 with two projects. */
async function at055(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_055)).toHaveLength(55);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  for (const id of ["p1", "p2"]) {
    await db.query(
      `INSERT INTO projects (id, workspace_id, name, source)
       VALUES ($1, $2, 'P', '{"kind":"url","url":"https://a.test/"}')`,
      [id, rows[0]?.id],
    );
  }
  return db;
}

async function stages(db: Database): Promise<Record<string, [unknown, unknown]>> {
  const { rows } = await db.query<{ id: string; stage: unknown; stage_changed_at: unknown }>(
    "SELECT id, stage, stage_changed_at FROM projects ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, [row.stage, row.stage_changed_at]]));
}

describe.each(databases)("migration 056 (%s)", (_name, make) => {
  it("leaves every existing project without a stage", async () => {
    const db = await at055(make);
    expect(await migrate(db, UP_TO_056)).toEqual(NEW);
    expect(await stages(db)).toEqual({ p1: [null, null], p2: [null, null] });
  });

  it("takes the four stages and none, and refuses anything else", async () => {
    const db = await at055(make);
    await migrate(db, UP_TO_056);
    for (const stage of ["open-for-review", "editing", "on-hold", "approved", null]) {
      await db.query("UPDATE projects SET stage = $1 WHERE id = 'p1'", [stage]);
      expect((await stages(db)).p1?.[0]).toBe(stage);
    }
    for (const stage of ["Approved", "with-client", "", "done"]) {
      await expect(
        db.query("UPDATE projects SET stage = $1 WHERE id = 'p1'", [stage]),
        stage,
      ).rejects.toThrow();
    }
  });

  it("changes nothing when it runs again", async () => {
    const db = await at055(make);
    await migrate(db, UP_TO_056);
    const at = new Date(Date.UTC(2026, 10, 27));
    await db.query(
      "UPDATE projects SET stage = 'approved', stage_changed_at = $1 WHERE id = 'p1'",
      [at],
    );
    expect(await migrate(db, UP_TO_056)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    const after = await stages(db);
    expect(after.p1?.[0]).toBe("approved");
    expect(new Date(after.p1?.[1] as string | Date).getTime()).toBe(at.getTime());
    expect(after.p2).toEqual([null, null]);
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_constraint
       WHERE conname = 'projects_stage_check' AND conrelid = 'projects'::regclass`,
    );
    expect(rows[0]?.count).toBe(1);
    await expect(db.query("UPDATE projects SET stage = 'shipped'")).rejects.toThrow();
  });
});
