import type { OrphanScan, SweepResult } from "./orphan-blobs";
import { ORPHAN_BLOB_MS } from "./retention";
import type { ShareServices } from "./server";
import { revokeShare } from "./service";

/** Expired shares fetched per store query. */
export const EXPIRY_BATCH = 100;

export interface ExpiredShares {
  expired: number;
  /** False when `deadline` passed first; the next run picks up the rest. */
  done: boolean;
}

/**
 * Revokes every share whose `expiresAt` has passed at `now`, soonest first,
 * `EXPIRY_BATCH` at a time, until none are left or `deadline` (epoch ms)
 * passes. Revoking deletes the rows (snapshots, comments, images) and then
 * their Blob files, like the owner's Revoke.
 */
export async function expireShares(
  services: ShareServices,
  now: number,
  deadline: number,
): Promise<ExpiredShares> {
  let expired = 0;
  for (;;) {
    const ids = await services.store.expiredIds(now, EXPIRY_BATCH);
    for (const id of ids) {
      if (Date.now() >= deadline) return { expired, done: false };
      await revokeShare(services, { id });
      expired += 1;
    }
    if (ids.length < EXPIRY_BATCH) return { expired, done: true };
  }
}

/**
 * Which Blob files are orphans at `now`, for the sweep and its dry run alike:
 * uploaded before the cutoff (a day past retention), under a share whose row
 * is gone.
 */
function orphanRule(
  store: ShareServices["store"],
  now: number,
): [before: number, isLive: (shareId: string) => Promise<boolean>] {
  return [now - ORPHAN_BLOB_MS, (shareId) => store.exists(shareId)];
}

/**
 * Deletes Blob files a failed revoke left behind: uploaded more than a day
 * past retention, under a share whose row is gone (`exists`). A share that's
 * only closed (its project in the trash, its workspace archived or waiting to
 * be deleted) keeps its files, to open with them again. Safe whether or not
 * `expireShares` finished: a share it hasn't reached yet still counts as
 * live. Null when images aren't kept in Vercel Blob.
 */
export async function sweepOrphanedBlobs(
  { store, blobs }: ShareServices,
  now: number,
  deadline: number,
): Promise<SweepResult | null> {
  if (!blobs.sweep) return null;
  return blobs.sweep(...orphanRule(store, now), deadline);
}

/**
 * What `sweepOrphanedBlobs` would delete at `now`, by the same cutoff and the
 * same live check, counted and never deleted: the admin's dry run. Null when
 * images aren't kept in Vercel Blob.
 */
export async function scanOrphanedBlobs(
  { store, blobs }: ShareServices,
  now: number,
  deadline: number,
): Promise<OrphanScan | null> {
  if (!blobs.scan) return null;
  return blobs.scan(...orphanRule(store, now), deadline);
}
