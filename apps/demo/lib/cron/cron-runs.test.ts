import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratedPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { migrate } from "../share/migrate";
import {
  claimCronRun,
  CRON_RUN_KEEP_MS,
  CRON_RUN_STALE_MS,
  finishCronRun,
  listCronRuns,
} from "./cron-runs";
import { EXPIRY_STEPS, type ExpiryReport, type ExpiryStep } from "./expiry-steps";

const NOW = Date.UTC(2026, 10, 18, 4);
const MINUTE = 60_000;

/** A report with every step at 0 and nothing failed, then `failed` steps failed (count null). */
function report(failed: ExpiryStep[] = [], done = failed.length === 0): ExpiryReport {
  const counts = Object.fromEntries(
    EXPIRY_STEPS.map((step) => [step, failed.includes(step) ? null : 0]),
  ) as Record<ExpiryStep, number | null>;
  const flags = Object.fromEntries(EXPIRY_STEPS.map((step) => [step, failed.includes(step)]));
  return { ...counts, done, failed: flags as Record<ExpiryStep, boolean> };
}

async function insertRun(db: Database, startedAt: number, finishedAt: number | null = null) {
  await db.query("INSERT INTO cron_runs (trigger, started_at, finished_at) VALUES ($1, $2, $3)", [
    "schedule",
    new Date(startedAt),
    finishedAt === null ? null : new Date(finishedAt),
  ]);
}

describe("claiming a run", () => {
  it("records a run, and refuses another while it's unfinished", async () => {
    const db = await migratedPglite();
    const first = await claimCronRun(db, "admin", NOW);
    expect(first).toEqual(expect.any(String));
    expect(await claimCronRun(db, "schedule", NOW + MINUTE)).toBeNull();
    const { rows } = await db.query<{ trigger: string; finished_at: Date | null }>(
      "SELECT trigger, finished_at FROM cron_runs",
    );
    expect(rows).toEqual([{ trigger: "admin", finished_at: null }]);
  });

  it("claims again once the run finished", async () => {
    const db = await migratedPglite();
    const id = (await claimCronRun(db, "schedule", NOW)) ?? "";
    await finishCronRun(db, id, report(), NOW + MINUTE);
    expect(await claimCronRun(db, "admin", NOW + MINUTE)).toEqual(expect.any(String));
  });

  it("isn't held off by an unfinished run older than the stale limit", async () => {
    const db = await migratedPglite();
    await insertRun(db, NOW - CRON_RUN_STALE_MS - 1);
    expect(await claimCronRun(db, "schedule", NOW)).toEqual(expect.any(String));
    await insertRun(db, NOW + MINUTE - CRON_RUN_STALE_MS + 1);
    expect(await claimCronRun(db, "schedule", NOW + MINUTE)).toBeNull();
  });
});

describe("finishing a run", () => {
  it("keeps the counts and the failed steps' names, nothing else", async () => {
    const db = await migratedPglite();
    const id = (await claimCronRun(db, "schedule", NOW)) ?? "";
    await finishCronRun(db, id, { ...report(["blobs", "pins"]), shares: 3 }, NOW + MINUTE);
    const { rows } = await db.query<{
      finished_at: Date;
      done: boolean;
      failed: boolean;
      counts: { steps: Record<string, number | null>; failed: string[] };
    }>("SELECT finished_at, done, failed, counts FROM cron_runs");
    expect(rows[0]).toMatchObject({
      finished_at: new Date(NOW + MINUTE),
      done: false,
      failed: true,
      counts: { failed: ["blobs", "pins"] },
    });
    expect(rows[0]?.counts.steps).toMatchObject({ shares: 3, blobs: null, pins: null, trash: 0 });
    expect(Object.keys(rows[0]?.counts ?? {}).sort()).toEqual(["failed", "steps"]);
  });

  it("deletes runs that started more than 90 days before", async () => {
    const db = await migratedPglite();
    await insertRun(db, NOW - CRON_RUN_KEEP_MS - 1, NOW - CRON_RUN_KEEP_MS);
    await insertRun(db, NOW - CRON_RUN_KEEP_MS + MINUTE, NOW - CRON_RUN_KEEP_MS + 2 * MINUTE);
    const id = (await claimCronRun(db, "schedule", NOW)) ?? "";
    await finishCronRun(db, id, report(), NOW);
    const { rows } = await db.query("SELECT 1 FROM cron_runs");
    expect(rows).toHaveLength(2);
  });
});

describe("listing runs", () => {
  it("says how each stands, newest first", async () => {
    const db = await migratedPglite();
    const finish = async (at: number, result: ExpiryReport) => {
      await insertRun(db, at);
      const { rows } = await db.query<{ id: string }>(
        "SELECT id::text AS id FROM cron_runs ORDER BY id DESC LIMIT 1",
      );
      await finishCronRun(db, rows[0]?.id ?? "", result, at + MINUTE);
    };
    await finish(NOW - 5 * MINUTE * 60, report());
    await finish(NOW - 4 * MINUTE * 60, report([], false));
    await finish(NOW - 3 * MINUTE * 60, report(["trash"]));
    await insertRun(db, NOW - 2 * MINUTE * 60);
    await insertRun(db, NOW - MINUTE);
    await db.query(
      `UPDATE cron_runs SET counts = '{"failed":["trash","https://x.test/a",42]}'::jsonb
       WHERE started_at = $1`,
      [new Date(NOW - 3 * MINUTE * 60)],
    );

    const runs = await listCronRuns(db, 20, NOW);

    expect(runs.map(({ status, failedSteps }) => ({ status, failedSteps }))).toEqual([
      { status: "running", failedSteps: [] },
      { status: "abandoned", failedSteps: [] },
      { status: "failed", failedSteps: ["trash"] },
      { status: "partial", failedSteps: [] },
      { status: "finished", failedSteps: [] },
    ]);
    expect(runs[4]).toMatchObject({
      trigger: "schedule",
      startedAt: NOW - 5 * MINUTE * 60,
      finishedAt: NOW - 5 * MINUTE * 60 + MINUTE,
    });
    expect(await listCronRuns(db, 2, NOW)).toHaveLength(2);
  });
});

/**
 * Claims racing on real connections: PGlite runs one transaction at a time,
 * so this needs a Postgres of its own in TEST_DATABASE_URL; skipped without it.
 */
describe.skipIf(!TEST_DATABASE_URL)("claiming runs in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 8);
    await migrate(fresh.db);
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("lets exactly one of 8 parallel claims through", async () => {
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        claimCronRun(fresh.db, index % 2 ? "admin" : "schedule", NOW),
      ),
    );
    expect(claims.filter((id) => id !== null)).toHaveLength(1);
    const { rows } = await fresh.db.query("SELECT 1 FROM cron_runs");
    expect(rows).toHaveLength(1);
  });
});
