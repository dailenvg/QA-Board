import type { Queryable } from "../share/migrate";
import { scanOrphanedBlobs } from "../share/expiry";
import type { OrphanTally } from "../share/orphan-blobs";
import type { ShareServices } from "../share/server";
import type { AnyBlobDriver } from "../workspace/blob-driver";
import { scanWorkspaceBlobs } from "../workspace/purge";

/**
 * The Storage page's orphan check: what the daily cleanup's file sweeps
 * would delete right now, counted by their own rules and never deleted. On
 * demand only: listing Vercel Blob is billed per call.
 */

/** The check stops listing after this long and says it's partial. */
export const ORPHAN_CHECK_BUDGET_MS = 20_000;

export interface OrphanReport {
  /** When it was checked, epoch ms. */
  checkedAt: number;
  /** False when the time ran out before every listing ended: the counts are a floor. */
  complete: boolean;
  /** Review link files in Vercel Blob whose share is gone; null when they aren't kept there. */
  shareFiles: OrphanTally | null;
  /** Workspace file rows whose project is gone. */
  workspaceRows: OrphanTally;
  /** Workspace, logo and avatar files no row records; null without Vercel Blob. */
  unrecordedFiles: OrphanTally | null;
}

export interface OrphanServices {
  shares: ShareServices;
  blobs: AnyBlobDriver;
}

/** Both sweeps' dry runs at `now`, side by side, within `ORPHAN_CHECK_BUDGET_MS`. */
export async function checkOrphans(
  db: Queryable,
  { shares, blobs }: OrphanServices,
  now: number,
): Promise<OrphanReport> {
  const deadline = now + ORPHAN_CHECK_BUDGET_MS;
  const [shareScan, workspaceScan] = await Promise.all([
    scanOrphanedBlobs(shares, now, deadline),
    scanWorkspaceBlobs(db, blobs, now, deadline),
  ]);
  return {
    checkedAt: now,
    complete: (shareScan?.done ?? true) && workspaceScan.done,
    shareFiles: shareScan && { files: shareScan.files, bytes: shareScan.bytes },
    workspaceRows: workspaceScan.rows,
    unrecordedFiles: workspaceScan.unrecorded,
  };
}
