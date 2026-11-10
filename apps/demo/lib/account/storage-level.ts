/**
 * How full a workspace's storage is, and its sizes as people read them.
 * Pure, for the Storage page on the server and in the browser alike.
 */

/** From this share of the quota on, the Storage page warns that space is running low. */
export const NEAR_QUOTA_RATIO = 0.8;

/** `ok` below `NEAR_QUOTA_RATIO`, `near` from it, `over` once the quota is used up (uploads stop). */
export type StorageLevel = "ok" | "near" | "over";

export function storageLevel(usedBytes: number, quotaBytes: number): StorageLevel {
  if (quotaBytes <= 0 || usedBytes >= quotaBytes) return "over";
  return usedBytes >= quotaBytes * NEAR_QUOTA_RATIO ? "near" : "ok";
}

/**
 * The whole percent of the quota used, rounded down so it never says 80%
 * before the warning shows. Anything stored is at least 1%; past the quota it
 * goes over 100.
 */
export function usedPercent(usedBytes: number, quotaBytes: number): number {
  if (usedBytes <= 0) return 0;
  if (quotaBytes <= 0) return 100;
  return Math.max(1, Math.floor((usedBytes / quotaBytes) * 100));
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const STEP = 1024;

/** A size in bytes as `0 B`, `340 KB`, `1.2 GB`: one decimal under 10, none from 10 on. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  const shown = new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
  return `${shown} ${UNITS[unit]}`;
}
