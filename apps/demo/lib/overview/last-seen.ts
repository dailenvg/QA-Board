/**
 * When this browser last looked at a workspace's Overview, so the Overview can
 * mark what came in since. Kept in localStorage per workspace, apart from the
 * workspace data; storage that's blocked or full only means nothing is
 * remembered. Safe to import on the server, where there's no storage.
 */

/** A first visit (nothing remembered) treats the last week as new. */
export const FIRST_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const keyOf = (workspaceId: string) => `squint:last-seen:${workspaceId}`;

export type LastSeenStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LastSeenStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The remembered time (epoch ms), or null when there's none or it can't be read. */
export function readLastSeen(
  workspaceId: string,
  storage: LastSeenStorage | null = browserStorage(),
): number | null {
  try {
    const value = Number(storage?.getItem(keyOf(workspaceId)) ?? Number.NaN);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSeen(
  workspaceId: string,
  at: number,
  storage: LastSeenStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(keyOf(workspaceId), String(at));
  } catch {
    // Not remembered: the next visit treats the last week as new.
  }
}

/** What counts as new on one look at the Overview. */
export interface Visit {
  /** Anything after this (epoch ms) is new. */
  since: number;
}

/**
 * Starts a look at the Overview at `now`: remembers `now` for next time and
 * returns what counts as new this time, after the previous look (never later
 * than `now`), else within the last `FIRST_VISIT_WINDOW_MS`.
 */
export function beginVisit(
  workspaceId: string,
  now: number,
  storage: LastSeenStorage | null = browserStorage(),
): Visit {
  const previous = readLastSeen(workspaceId, storage);
  writeLastSeen(workspaceId, now, storage);
  return previous === null
    ? { since: now - FIRST_VISIT_WINDOW_MS }
    : { since: Math.min(previous, now) };
}
