import { z } from "zod";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { toDate, toMs, toMsOrNull } from "../workspace/times";
import {
  EXPIRY_STEPS,
  isExpiryStep,
  type CronTrigger,
  type ExpiryReport,
  type ExpiryStep,
} from "./expiry-steps";

/**
 * The daily cleanup's runs, as `cron_runs` (047) keeps them: one claimed
 * before the steps start, finished with their counts once they're done.
 */

/**
 * An unfinished run younger than this holds off another; an older one died
 * (a run stops within its 60 seconds) and never blocks.
 */
export const CRON_RUN_STALE_MS = 2 * 60 * 1000;

/** Runs are kept this long, then the next run deletes them. */
export const CRON_RUN_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

/** One advisory lock for every claim, so two can't both find nothing running. */
const CLAIM_LOCK = "squint:cron:expire";

/**
 * Claims a run started by `trigger` at `now`: under the claim lock, refuses
 * (null) while another run started less than `CRON_RUN_STALE_MS` ago hasn't
 * finished, else records this one and answers its id.
 */
export function claimCronRun(
  db: Database,
  trigger: CronTrigger,
  now: number,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [CLAIM_LOCK]);
    const { rows: running } = await tx.query(
      "SELECT 1 FROM cron_runs WHERE finished_at IS NULL AND started_at > $1 LIMIT 1",
      [toDate(now - CRON_RUN_STALE_MS)],
    );
    if (running.length > 0) return null;
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO cron_runs (trigger, started_at) VALUES ($1, $2) RETURNING id::text AS id",
      [trigger, toDate(now)],
    );
    return rows[0]?.id ?? null;
  });
}

/** What a finished run's `counts` keeps: each step's count, and the names of those that failed. */
function countsOf(report: ExpiryReport) {
  return {
    steps: Object.fromEntries(EXPIRY_STEPS.map((step) => [step, report[step]])),
    failed: EXPIRY_STEPS.filter((step) => report.failed[step]),
  };
}

/**
 * Records how the run `id` ended at `now`, and deletes the runs that started
 * more than `CRON_RUN_KEEP_MS` before it.
 */
export async function finishCronRun(
  db: Queryable,
  id: string,
  report: ExpiryReport,
  now: number,
): Promise<void> {
  const counts = countsOf(report);
  await db.query(
    `UPDATE cron_runs SET finished_at = $2, done = $3, failed = $4, counts = $5::jsonb
     WHERE id = $1`,
    [id, toDate(now), report.done, counts.failed.length > 0, JSON.stringify(counts)],
  );
  await db.query("DELETE FROM cron_runs WHERE started_at < $1", [toDate(now - CRON_RUN_KEEP_MS)]);
}

/**
 * How a run stands: `finished` with everything done, `partial` when its time
 * ran out (the next run carries on), `failed` when a step failed, `running`
 * while it's unfinished and young, `abandoned` when it never finished.
 */
export type CronRunStatus = "finished" | "partial" | "failed" | "running" | "abandoned";

export interface CronRun {
  id: string;
  trigger: CronTrigger;
  startedAt: number;
  /** Null while it runs, or when it never finished. */
  finishedAt: number | null;
  status: CronRunStatus;
  /** The steps that failed, by name; empty unless `status` is `failed`. */
  failedSteps: ExpiryStep[];
}

interface CronRunRow {
  id: string;
  trigger: CronTrigger;
  started_at: Date;
  finished_at: Date | null;
  done: boolean | null;
  failed: boolean | null;
  counts: unknown;
}

/** The failed steps' names from a record's `counts`; anything else there is ignored. */
const countsSchema = z
  .object({ failed: z.array(z.unknown()).catch([]) })
  .catch({ failed: [] as unknown[] });

function statusOf(row: CronRunRow, now: number): CronRunStatus {
  if (!row.finished_at) {
    return toMs(row.started_at) > now - CRON_RUN_STALE_MS ? "running" : "abandoned";
  }
  if (row.failed) return "failed";
  return row.done ? "finished" : "partial";
}

function toCronRun(row: CronRunRow, now: number): CronRun {
  const status = statusOf(row, now);
  const failed = countsSchema.parse(row.counts ?? {}).failed.filter(isExpiryStep);
  return {
    id: row.id,
    trigger: row.trigger,
    startedAt: toMs(row.started_at),
    finishedAt: toMsOrNull(row.finished_at),
    status,
    failedSteps: status === "failed" ? failed : [],
  };
}

/** The `limit` latest runs, newest first, as they stand at `now`. */
export async function listCronRuns(db: Queryable, limit: number, now: number): Promise<CronRun[]> {
  const { rows } = await db.query<CronRunRow>(
    `SELECT id::text AS id, trigger, started_at, finished_at, done, failed, counts
     FROM cron_runs ORDER BY started_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => toCronRun(row, now));
}
