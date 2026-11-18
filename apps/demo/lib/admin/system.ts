import { listCronRuns, type CronRun } from "../cron/cron-runs";
import type { Queryable } from "../share/migrate";
import { rateLimits, type RateLimitEntry } from "./rate-limits";
import { serviceStatuses, type ServiceStatus } from "./services";

/**
 * The admin panel's System page: which services are configured, the daily
 * cleanup's recent runs, and every rate limit. Read-only.
 */

/** How many runs the page lists. */
export const CRON_RUNS_SHOWN = 20;

export interface AdminSystem {
  services: ServiceStatus[];
  runs: CronRun[];
  rateLimits: RateLimitEntry[];
}

type Env = Readonly<Record<string, string | undefined>>;

export async function loadAdminSystem(
  db: Queryable,
  now: number,
  env: Env = process.env,
): Promise<AdminSystem> {
  return {
    services: serviceStatuses(env),
    runs: await listCronRuns(db, CRON_RUNS_SHOWN, now),
    rateLimits: rateLimits(env),
  };
}
