/**
 * Dates and times for the admin panel, always in UTC and spelled out by hand,
 * so the server's render and the browser's hydration read the same whatever
 * either's time zone or ICU data. Client-safe.
 */

/** One UTC day, in ms. */
export const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const two = (value: number) => String(value).padStart(2, "0");

/** "Nov 7". */
export function utcDay(at: number): string {
  const date = new Date(at);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Nov 7, 2026, 09:05 UTC". */
export function utcDateTime(at: number): string {
  const date = new Date(at);
  return `${utcDay(at)}, ${date.getUTCFullYear()}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

/** "Nov 7, 2026". */
export function utcDate(at: number): string {
  return `${utcDay(at)}, ${new Date(at).getUTCFullYear()}`;
}

/** "09:05 UTC". */
export function utcTime(at: number): string {
  const date = new Date(at);
  return `${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}
