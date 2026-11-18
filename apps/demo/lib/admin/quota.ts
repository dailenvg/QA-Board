/**
 * A workspace's storage quota as the admin panel edits it: typed in GB,
 * stored in bytes, within bounds. GB here is 1024³ bytes, as `formatBytes`
 * shows sizes, so 5 GB typed is the 5 GB the Storage page shows. Client-safe.
 */

export const BYTES_PER_GB = 1024 ** 3;

/** The smallest quota the admin can set: 0.1 GB. */
export const MIN_QUOTA_GB = 0.1;
/** The largest: 1,024 GB (1 TB). */
export const MAX_QUOTA_GB = 1024;

export const MIN_QUOTA_BYTES = Math.round(MIN_QUOTA_GB * BYTES_PER_GB);
export const MAX_QUOTA_BYTES = MAX_QUOTA_GB * BYTES_PER_GB;

/** `bytes` in GB, to one decimal, for the quota field. */
export function quotaGb(bytes: number): number {
  return Math.round((bytes / BYTES_PER_GB) * 10) / 10;
}

/**
 * The bytes for a quota typed in GB (`"5"`, `"2.5"`), or null when it isn't
 * a number with at most one decimal, or is outside the bounds.
 */
export function parseQuotaGb(input: string): number | null {
  const value = input.trim();
  if (!/^\d{1,4}(\.\d)?$/.test(value)) return null;
  const gb = Number(value);
  if (gb < MIN_QUOTA_GB || gb > MAX_QUOTA_GB) return null;
  return Math.round(gb * BYTES_PER_GB);
}
