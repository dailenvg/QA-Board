/**
 * The Overview's small infographics and list fitting, as plain numbers. Pure:
 * callers pass the clock and the measured sizes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days the Recently updated chart covers, today included. */
export const CHART_DAYS = 7;

/** The start (local midnight) of the day `at` falls on. */
export function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * How many of `times` fall on each of the last `days` days, oldest first,
 * today last. `today` is the start of today (`startOfDay`); times before the
 * first day or after today are left out. Days are 24 hours long, so a
 * daylight-saving change can shift an hour's worth to the neighbouring day.
 */
export function perDay(
  times: readonly number[],
  today: number,
  days: number = CHART_DAYS,
): number[] {
  const counts = Array.from({ length: days }, () => 0);
  const first = today - (days - 1) * DAY_MS;
  for (const at of times) {
    if (at < first || at >= today + DAY_MS) continue;
    const index = Math.floor((at - first) / DAY_MS);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

/**
 * How long something has waited as a share (0 to 1) of what's waited
 * longest (`oldestAt`), for a row's age bar: the oldest is 1.
 */
export function ageShare(at: number, oldestAt: number, now: number): number {
  const longest = now - oldestAt;
  if (longest <= 0) return 1;
  return Math.min(1, Math.max(0, (now - at) / longest));
}

export interface FitInput {
  /** Height the list may take, in px. */
  available: number;
  /** One row's height, in px, and the gap between rows. */
  row: number;
  gap: number;
  /** The "+N more" link's height, taken below the rows when any are left out. */
  more: number;
  /** Rows there are to show. */
  total: number;
}

/**
 * How many rows fit in `available`, leaving room for the "+N more" link
 * whenever some don't. At least one row while there are any, so a tile never
 * shows only its "more" link.
 */
export function rowsThatFit({ available, row, gap, more, total }: FitInput): number {
  if (total === 0) return 0;
  const height = (count: number) => count * row + Math.max(0, count - 1) * gap;
  if (height(total) <= available) return total;
  let count = total - 1;
  while (count > 1 && height(count) + gap + more > available) count -= 1;
  return Math.max(1, count);
}
