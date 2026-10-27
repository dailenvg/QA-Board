import type { SweepResult } from "./orphan-blobs";
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
 * Deletes Blob files a failed revoke left behind: uploaded more than a day
 * past retention, under a share that's gone. Safe whether or not
 * `expireShares` finished: a share it hasn't reached yet still counts as
 * live. Null when images aren't kept in Vercel Blob.
 */
export async function sweepOrphanedBlobs(
  { store, blobs }: ShareServices,
  now: number,
  deadline: number,
): Promise<SweepResult | null> {
  if (!blobs.sweep) return null;
  const isLive = async (shareId: string) => (await store.byId(shareId)) !== null;
  return blobs.sweep(now - ORPHAN_BLOB_MS, isLive, deadline);
}
