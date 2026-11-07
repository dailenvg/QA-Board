import type { Queryable } from "../share/migrate";
import type { ShareServices } from "../share/server";
import { revokeShare } from "../share/service";
import type { AnyBlobDriver } from "./blob-driver";
import { parseBlobPath, projectBlobPrefix, WORKSPACE_BLOB_PREFIX } from "./blob-paths";
import { blobRowExists, deleteBlobRows, orphanedBlobRows, toLocation } from "./blobs";
import { TRASH_GRACE_MS, UNCOMMITTED_BLOB_MS } from "./limits";
import { projectShareIds } from "./share-links";
import { toDate } from "./times";

/** Deleting projects for good, and the files nothing points at any more. */

export interface PurgeServices {
  shares: ShareServices;
  blobs: AnyBlobDriver;
}

export interface PurgeResult {
  count: number;
  /** False when `deadline` passed first; the next run picks up the rest. */
  done: boolean;
}

/** Projects per query; files per delete. */
const BATCH = 50;

/**
 * Deletes one project of the workspace for good: its shares first (revoked
 * like the owner's Revoke, so their files go too), then its rows (pages,
 * snapshots, comments, review link), then its files.
 */
export async function purgeProject(
  db: Queryable,
  services: PurgeServices,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  for (const id of await projectShareIds(db, workspaceId, projectId)) {
    await revokeShare(services.shares, { id });
  }
  await db.query("DELETE FROM projects WHERE workspace_id = $1 AND id = $2", [
    workspaceId,
    projectId,
  ]);
  // 019's foreign key kept the file rows, without their project.
  const { rows } = await db.query<{
    key: string;
    bytes: Uint8Array | null;
    blob_url: string | null;
  }>(
    `SELECT key, bytes, blob_url FROM workspace_blobs
     WHERE workspace_id = $1 AND project_id IS NULL AND starts_with(key, $2)`,
    [workspaceId, projectBlobPrefix(workspaceId, projectId)],
  );
  await services.blobs.discard(rows.map(toLocation));
  await deleteBlobRows(
    db,
    rows.map((row) => ({ workspaceId, path: row.key })),
  );
}

/** Deletes projects trashed more than `TRASH_GRACE_MS` before `now`, oldest first, until `deadline`. */
export async function purgeTrash(
  db: Queryable,
  services: PurgeServices,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  let count = 0;
  for (;;) {
    const { rows } = await db.query<{ workspace_id: string; id: string }>(
      `SELECT workspace_id, id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= $1
       ORDER BY deleted_at, id LIMIT $2`,
      [toDate(now - TRASH_GRACE_MS), BATCH],
    );
    for (const row of rows) {
      if (Date.now() >= deadline) return { count, done: false };
      await purgeProject(db, services, row.workspace_id, row.id);
      count += 1;
    }
    if (rows.length < BATCH) return { count, done: true };
  }
}

/** Rows whose project is gone (a folder deleted with trashed projects, a failed purge): files, then rows. */
async function sweepOrphanedRows(db: Queryable, blobs: AnyBlobDriver, deadline: number) {
  let count = 0;
  for (;;) {
    if (Date.now() >= deadline) return { count, done: false };
    const rows = await orphanedBlobRows(db, BATCH);
    await blobs.discard(rows.map((row) => row.location));
    await deleteBlobRows(db, rows);
    count += rows.length;
    if (rows.length < BATCH) return { count, done: true };
  }
}

/**
 * Vercel Blob files under `ws/` that no row records, uploaded more than
 * `UNCOMMITTED_BLOB_MS` before `now`: an upload whose commit never came.
 * Paths that aren't a project file's are never touched.
 */
async function sweepUncommitted(
  db: Queryable,
  blobs: AnyBlobDriver,
  now: number,
  deadline: number,
) {
  if (blobs.kind !== "vercel") return { count: 0, done: true };
  let count = 0;
  let cursor: string | undefined;
  do {
    if (Date.now() >= deadline) return { count, done: false };
    const page = await blobs.list(WORKSPACE_BLOB_PREFIX, cursor);
    const stale: string[] = [];
    for (const file of page.files) {
      const parsed = parseBlobPath(file.pathname);
      if (!parsed || file.uploadedAt.getTime() >= now - UNCOMMITTED_BLOB_MS) continue;
      if (!(await blobRowExists(db, parsed.workspaceId, file.pathname))) stale.push(file.url);
    }
    await blobs.discard(stale.map((url) => ({ kind: "vercel", url })));
    count += stale.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { count, done: true };
}

/** Both sweeps; `count` is the files deleted. */
export async function sweepWorkspaceBlobs(
  db: Queryable,
  blobs: AnyBlobDriver,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  const rows = await sweepOrphanedRows(db, blobs, deadline);
  if (!rows.done) return rows;
  const files = await sweepUncommitted(db, blobs, now, deadline);
  return { count: rows.count + files.count, done: files.done };
}
