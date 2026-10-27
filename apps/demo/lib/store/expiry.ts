import { isEpochMs, isExpired, retentionDeadline, withFullNotice } from "../share/retention";
import type { Project, SquintData } from "./types";

/** When this browser started counting projects toward deletion (epoch ms), kept apart from the data. */
export const RETENTION_START_KEY = "squint:retention-start";

/** This visit's start, so a blocked storage still gets one steady value. */
let remembered: number | undefined;

/** The saved start, if there's a usable one; null where storage is empty, junk or blocked. */
function storedStart(): number | null {
  try {
    const stored = Number(localStorage.getItem(RETENTION_START_KEY));
    return isEpochMs(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * When retention started in this browser: read once, or set to `now` on the
 * first load with retention and saved. Projects already older than 25 days
 * then still show their notice for 5 days before going. Where storage is
 * blocked it's this visit's start, which only ever keeps projects longer.
 * It writes, so call it from an effect (`LocalExpiry` does, through
 * `deleteExpiredProjects`); render reads with `readRetentionStart`.
 */
export function retentionStart(now: number = Date.now()): number {
  if (remembered !== undefined) return remembered;
  remembered = storedStart() ?? undefined;
  if (remembered !== undefined) return remembered;
  remembered = now;
  try {
    localStorage.setItem(RETENTION_START_KEY, String(now));
  } catch {
    // Not remembered: counted from this visit, so nothing goes sooner.
  }
  return remembered;
}

/**
 * `retentionStart` without saving anything, safe during render (and on the
 * server, where there's no storage). Before the first `retentionStart` it's
 * the saved start, or `now`: what that call is about to save.
 */
export function readRetentionStart(now: number = Date.now()): number {
  return remembered ?? storedStart() ?? now;
}

/**
 * When the project is deleted from this browser (epoch ms): 30 days after it
 * was created, but never sooner than 5 days after `retentionStart`, so its
 * "deletes on" notice always shows that long. A malformed creation date
 * counts from `retentionStart`.
 */
export function projectExpiresAt(project: Pick<Project, "createdAt">, start: number): number {
  const created = isEpochMs(project.createdAt) ? project.createdAt : start;
  return withFullNotice(retentionDeadline(created), start);
}

/** Projects past their `projectExpiresAt` at `now`: what the next load deletes. */
export function expiredProjects(data: SquintData, start: number, now: number): Project[] {
  return data.projects.filter((project) => isExpired(projectExpiresAt(project, start), now));
}
