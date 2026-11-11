import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 032: the schema production had when comment origins shipped. */
const UP_TO_031 = MIGRATIONS.slice(0, 31);
const NEW = ["032_projects_delete_after"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_032 = MIGRATIONS.slice(0, 31 + NEW.length);

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** A database at 031 with one project per entry, archived that long ago (null: not archived). */
async function at031(
  make: () => Promise<Database>,
  archivedDaysAgo: Record<string, number | null>,
) {
  const db = await make();
  expect(await migrate(db, UP_TO_031)).toHaveLength(31);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = rows[0]?.id ?? "";
  for (const [id, days] of Object.entries(archivedDaysAgo)) {
    await db.query(
      `INSERT INTO projects (id, workspace_id, name, source, archived_at)
       VALUES ($1, $2, 'P', '{"kind":"url","url":"https://a.test/"}',
         CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END)`,
      [id, workspaceId, days],
    );
  }
  return db;
}

/** Each project's delete date, in days from now (rounded), or null. */
async function dueInDays(db: Database): Promise<Record<string, number | null>> {
  const { rows } = await db.query<{ id: string; delete_after: Date | null; now: Date }>(
    "SELECT id, delete_after, now() AS now FROM projects ORDER BY id",
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      row.delete_after
        ? Math.round((row.delete_after.getTime() - new Date(row.now).getTime()) / DAY_MS)
        : null,
    ]),
  );
}

describe.each(databases)("migration 032 (%s)", (_name, make) => {
  it("gives archived projects 30 days from their archive date, but never less than 30 from now", async () => {
    const db = await at031(make, { live: null, recent: 0, old: 90 });
    expect(await migrate(db, UP_TO_032)).toEqual(NEW);
    expect(await dueInDays(db)).toEqual({ live: null, old: 30, recent: 30 });
    // Only an archived project can have a delete date.
    await expect(
      db.query("UPDATE projects SET delete_after = now() WHERE id = 'live'"),
    ).rejects.toThrow();
  });

  it("never moves a date when it runs again", async () => {
    const db = await at031(make, { old: 90 });
    await migrate(db, UP_TO_032);
    await db.query("UPDATE projects SET delete_after = now() + interval '3 days'");
    expect(await migrate(db, UP_TO_032)).toEqual([]);
    // By hand too: the column is there, so the guarded block skips the backfill.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    expect(await dueInDays(db)).toEqual({ old: 3 });
  });
});
