import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_046 = MIGRATIONS.slice(0, 46);
const CRON_RUNS = MIGRATIONS.find(({ id }) => id === "047_cron_runs");

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

describe.each(databases)("047_cron_runs on %s", (_name, make) => {
  it("adds an empty runs table after 046, and changes nothing the second time", async () => {
    const db = await make();
    expect(await migrate(db, UP_TO_046)).toHaveLength(46);
    expect(UP_TO_046.at(-1)?.id).toBe("046_workspaces_suspended_at");
    expect(await migrate(db, MIGRATIONS.slice(0, 47))).toEqual(["047_cron_runs"]);
    await db.query(CRON_RUNS?.sql ?? "");
    const { rows } = await db.query("SELECT 1 FROM cron_runs");
    expect(rows).toEqual([]);
  });

  it("takes a run by the schedule or the admin, unfinished until it's set", async () => {
    const db = await make();
    await migrate(db);
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO cron_runs (trigger) VALUES ('schedule'), ('admin')
       RETURNING trigger, started_at, finished_at, done, failed, counts`,
    );
    expect(rows).toEqual([
      expect.objectContaining({ trigger: "schedule", finished_at: null, done: null, counts: null }),
      expect.objectContaining({ trigger: "admin", failed: null }),
    ]);
    expect(rows[0]?.started_at).toBeInstanceOf(Date);
    await expect(db.query("INSERT INTO cron_runs (trigger) VALUES ('someone')")).rejects.toThrow();
    await expect(db.query("INSERT INTO cron_runs (trigger) VALUES (NULL)")).rejects.toThrow();
  });
});
