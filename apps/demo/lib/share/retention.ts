/**
 * How long a project is kept, counted from when it was created in the owner's
 * browser: its share on the server (deleted by the daily cron,
 * `/api/cron/expire`) and the project in that browser (`lib/store/expiry.ts`).
 * Every time here is epoch ms, never seconds.
 */
export const RETENTION_DAYS = 30;
/** How many days before deletion the "deletes on" notice shows (from day 25). */
export const DELETION_NOTICE_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = RETENTION_DAYS * DAY_MS;
export const DELETION_NOTICE_MS = DELETION_NOTICE_DAYS * DAY_MS;
/** Blob files a failed delete left behind are swept once this old: a day past retention. */
export const ORPHAN_BLOB_MS = (RETENTION_DAYS + 1) * DAY_MS;

/**
 * 2001-09-09 in epoch ms. A smaller `createdAt` is almost surely epoch
 * seconds, which read as ms would date the project to January 1970.
 */
const EARLIEST_MS = 1_000_000_000_000;

/** Whole epoch ms from 2001 on: never epoch seconds, a fraction, or junk. */
export function isEpochMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= EARLIEST_MS;
}

/**
 * When a share's project was created: its own `createdAt` when that's whole
 * epoch ms no later than the share, else the share's `createdAt`. A missing,
 * seconds-valued or future date only ever falls back, so it can't delete a
 * share early, or keep one past 30 days from its link.
 */
export function projectCreatedAt(project: { createdAt?: number }, shareCreatedAt: number): number {
  const { createdAt } = project;
  return isEpochMs(createdAt) && createdAt <= shareCreatedAt ? createdAt : shareCreatedAt;
}

/** 30 days after `createdAt`: when something created then is deleted, before the notice floor. */
export function retentionDeadline(createdAt: number): number {
  return createdAt + RETENTION_MS;
}

/**
 * `deadline`, moved later when needed so the "deletes on" notice shows for its
 * full 5 days from `shownFrom` (when the date could first be seen). Nothing is
 * deleted without that much warning.
 */
export function withFullNotice(deadline: number, shownFrom: number): number {
  return Math.max(deadline, shownFrom + DELETION_NOTICE_MS);
}

/**
 * When a share is deleted: 30 days after its project was created, but never
 * sooner than 5 days after its link was made. Migration 007 applies the same
 * rule in SQL to shares made before it, with one more floor: never sooner than
 * 5 days after the migration ran, since nobody could see a date before then.
 */
export function shareExpiresAt(project: { createdAt?: number }, shareCreatedAt: number): number {
  const deadline = retentionDeadline(projectCreatedAt(project, shareCreatedAt));
  return withFullNotice(deadline, shareCreatedAt);
}

/**
 * A share's deletion date after an owner push changed its project at `now`.
 * The project can reveal an earlier creation date (a share made before
 * projects carried one), but the date never moves to less than 5 days away:
 * the notice has to show that long first. A date already nearer stays put.
 */
export function rescheduledExpiry(
  current: number,
  project: { createdAt?: number },
  shareCreatedAt: number,
  now: number,
): number {
  return Math.max(
    shareExpiresAt(project, shareCreatedAt),
    Math.min(current, now + DELETION_NOTICE_MS),
  );
}

/** Pins created at or before this are expired at `now` (pins have no notice). */
export function retentionCutoff(now: number): number {
  return now - RETENTION_MS;
}

export function isExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

/** When the "deletes on" notice starts for a share deleted at `expiresAt`. */
export function deletionNoticeFrom(expiresAt: number): number {
  return expiresAt - DELETION_NOTICE_MS;
}

/** True from the notice's start until deletion. */
export function inDeletionNotice(expiresAt: number, now: number): boolean {
  return now >= deletionNoticeFrom(expiresAt) && !isExpired(expiresAt, now);
}
