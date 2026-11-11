import { audit } from "../account/audit";
import { describeError } from "../auth/http";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { createPostgresStore } from "../share/postgres-store";
import type { BlobLocation } from "../share/types";
import { toLocation } from "./blobs";
import type { PurgeServices } from "./purge";
import { toDate } from "./times";

/** Deleting a workspace for good once its time to be deleted (033) has come. */

/**
 * Deletes files whose rows are already gone. A failure is logged by kind
 * only and never thrown: the daily sweeps find what it left behind.
 */
export async function discardQuietly(
  what: string,
  store: { discard(locations: readonly BlobLocation[]): Promise<void> },
  locations: readonly BlobLocation[],
): Promise<void> {
  if (locations.length === 0) return;
  try {
    await store.discard(locations);
  } catch (error) {
    console.error(`squint purge: ${what} files left for the sweep (${describeError(error)})`);
  }
}

/**
 * Locks the workspace for its purge if it's still due by `now`: its usage row
 * first, then the workspace, in the order uploads take them. False once
 * restored (or already gone).
 */
async function lockDueWorkspace(tx: Queryable, workspaceId: string, now: number) {
  await tx.query("SELECT 1 FROM storage_usage WHERE workspace_id = $1 FOR UPDATE", [workspaceId]);
  const { rows } = await tx.query(
    `SELECT 1 FROM workspaces WHERE id = $1 AND delete_after IS NOT NULL AND delete_after <= $2
     FOR UPDATE`,
    [workspaceId, toDate(now)],
  );
  return rows.length === 1;
}

/**
 * Deletes a workspace due to be deleted by `now`, in one transaction: its
 * shares (and their rows), its file rows, then the workspace, whose foreign
 * keys take its folders, projects, comments, memberships and usage with it;
 * and an audit entry, which outlives it. Its files go once that commits.
 * False when it was restored first, or isn't there.
 */
export async function purgeWorkspace(
  db: Database,
  services: PurgeServices,
  workspaceId: string,
  now: number,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    if (!(await lockDueWorkspace(tx, workspaceId, now))) return null;
    const shares = createPostgresStore(tx);
    const { rows: shareIds } = await tx.query<{ id: string }>(
      "SELECT id FROM squint_shares WHERE workspace_id = $1",
      [workspaceId],
    );
    const shareFiles: BlobLocation[] = [];
    for (const { id } of shareIds) shareFiles.push(...(await shares.remove(id)));
    const { rows: files } = await tx.query<{ bytes: Uint8Array | null; blob_url: string | null }>(
      "DELETE FROM workspace_blobs WHERE workspace_id = $1 RETURNING bytes, blob_url",
      [workspaceId],
    );
    await tx.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await audit(
      tx,
      {
        actorUserId: null,
        workspaceId,
        action: "workspace.deleted",
        target: { type: "workspace", id: workspaceId },
        fields: ["workspace"],
      },
      now,
    );
    return { shareFiles, files: files.map(toLocation) };
  });
  if (!removed) return false;
  await discardQuietly("share", services.shareBlobs, removed.shareFiles);
  await discardQuietly("workspace", services.blobs, removed.files);
  return true;
}
