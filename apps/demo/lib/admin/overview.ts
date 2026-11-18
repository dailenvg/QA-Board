import type { Queryable } from "../share/migrate";
import { SHARE_ANSWERS } from "../share/postgres-store";
import { AUDIT_CATEGORIES, auditCategory, type AuditCategory } from "./audit-category";
import { DAY_MS } from "./utc-format";

/**
 * The admin panel's Overview: how much Squint holds across every workspace,
 * and what the audit log recorded day by day. Read-only.
 */

/** Days the activity covers, today (in UTC) included. */
export const ACTIVITY_DAYS = 30;

export interface AdminCounts {
  workspaces: number;
  /** Accounts that can sign in: not deleted, the admin included. */
  users: number;
  /** Projects not in the trash, archived ones included. */
  projects: number;
  /** Comments on those projects. */
  comments: number;
  /**
   * Review links a client can open right now: not revoked (a revoked share's
   * row is gone), not expired (an anonymous share's `expires_at`), and
   * answering (`SHARE_ANSWERS`: its project isn't trashed or archived, its
   * workspace isn't archived, due for deletion or suspended).
   */
  activeShares: number;
  /** Bytes stored across every workspace (storage_usage). */
  storageBytes: number;
}

export interface CategoryActivity {
  category: AuditCategory;
  /** Entries per day, oldest first, today last. */
  perDay: number[];
  total: number;
}

export interface AdminActivity {
  /** The first day's start, UTC midnight, as epoch ms; each day after is `DAY_MS` on. */
  firstDay: number;
  /** Every entry per day, oldest first, today last. */
  perDay: number[];
  total: number;
  /** Each category with at least one entry in the range, in `AUDIT_CATEGORIES` order. */
  categories: CategoryActivity[];
}

export interface AdminOverview {
  counts: AdminCounts;
  activity: AdminActivity;
}

/** Midnight UTC of the day `at` falls on. */
export function utcDayStart(at: number): number {
  return Math.floor(at / DAY_MS) * DAY_MS;
}

/** One day's entries for one action, as the activity query groups them. */
export interface DayActionCount {
  /** The day's start, UTC midnight, as epoch ms. */
  day: number;
  action: string;
  count: number;
}

/**
 * `rows` as `days` daily buckets ending on `today` (a UTC midnight), every
 * day present, empty ones as 0. Rows outside the range are left out.
 */
export function dailyActivity(
  rows: readonly DayActionCount[],
  today: number,
  days: number = ACTIVITY_DAYS,
): AdminActivity {
  const firstDay = today - (days - 1) * DAY_MS;
  const empty = () => Array.from({ length: days }, () => 0);
  const perDay = empty();
  const byCategory = new Map<AuditCategory, number[]>();
  for (const row of rows) {
    const index = Math.round((row.day - firstDay) / DAY_MS);
    if (index < 0 || index >= days) continue;
    perDay[index] = (perDay[index] ?? 0) + row.count;
    const category = auditCategory(row.action);
    const series = byCategory.get(category) ?? empty();
    series[index] = (series[index] ?? 0) + row.count;
    byCategory.set(category, series);
  }
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  return {
    firstDay,
    perDay,
    total: sum(perDay),
    categories: AUDIT_CATEGORIES.flatMap((category) => {
      const series = byCategory.get(category);
      return series ? [{ category, perDay: series, total: sum(series) }] : [];
    }),
  };
}

interface CountsRow {
  workspaces: number;
  users: number;
  projects: number;
  comments: number;
  active_shares: number;
  storage_bytes: string | number;
}

export async function loadAdminCounts(db: Queryable, now: number): Promise<AdminCounts> {
  const { rows } = await db.query<CountsRow>(
    `SELECT
       (SELECT count(*) FROM workspaces)::int AS workspaces,
       (SELECT count(*) FROM users WHERE deleted_at IS NULL)::int AS users,
       (SELECT count(*) FROM projects WHERE deleted_at IS NULL)::int AS projects,
       (SELECT count(*) FROM comments AS comment
          JOIN projects AS project ON project.id = comment.project_id
          WHERE project.deleted_at IS NULL)::int AS comments,
       (SELECT count(*) FROM squint_shares
          WHERE (expires_at IS NULL OR expires_at > $1) AND ${SHARE_ANSWERS})::int AS active_shares,
       (SELECT coalesce(sum(bytes), 0) FROM storage_usage) AS storage_bytes`,
    [now],
  );
  const row = rows[0];
  return {
    workspaces: row?.workspaces ?? 0,
    users: row?.users ?? 0,
    projects: row?.projects ?? 0,
    comments: row?.comments ?? 0,
    activeShares: row?.active_shares ?? 0,
    storageBytes: Number(row?.storage_bytes ?? 0),
  };
}

interface DayActionRow {
  day: string | number;
  action: string;
  count: number;
}

/** The audit log's entries per UTC day and action, over the `ACTIVITY_DAYS` ending today. */
export async function loadAdminActivity(db: Queryable, now: number): Promise<AdminActivity> {
  const today = utcDayStart(now);
  const firstDay = today - (ACTIVITY_DAYS - 1) * DAY_MS;
  const { rows } = await db.query<DayActionRow>(
    `SELECT (extract(epoch FROM date_trunc('day', at AT TIME ZONE 'UTC')) * 1000)::bigint AS day,
       action, count(*)::int AS count
     FROM audit_log
     WHERE at >= $1 AND at < $2
     GROUP BY 1, 2`,
    [new Date(firstDay), new Date(today + DAY_MS)],
  );
  return dailyActivity(
    rows.map((row) => ({ day: Number(row.day), action: row.action, count: row.count })),
    today,
  );
}

export async function loadAdminOverview(db: Queryable, now: number): Promise<AdminOverview> {
  const [counts, activity] = await Promise.all([
    loadAdminCounts(db, now),
    loadAdminActivity(db, now),
  ]);
  return { counts, activity };
}
