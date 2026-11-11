import { avatarRowExists, parseAvatarPath, USER_BLOB_PREFIX } from "../account/avatar";
import type { Database } from "../db/database";
import type { BlobBackend } from "../share/blob-backend";
import type { Queryable } from "../share/migrate";
import { createPostgresStore } from "../share/postgres-store";
import type { AnyBlobDriver, ClientUploadDriver } from "./blob-driver";
import {
  parseBlobPath,
  parseBrandLogoPath,
  projectBlobPrefix,
  WORKSPACE_BLOB_PREFIX,
} from "./blob-paths";
import { blobRowExists, deleteBlobRows, orphanedBlobRows, toLocation } from "./blobs";
import { TRASH_GRACE_MS, UNCOMMITTED_BLOB_MS } from "./limits";
import { projectShareIds } from "./share-links";
import { toDate } from "./times";

/** Deleting projects for good, and the files nothing points at any more. */

export interface PurgeServices {
  /** Where share files live (`ShareServices.blobs`). */
  shareBlobs: BlobBackend;
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
 * Deletes one trashed project of the workspace for good, if it's still in
 * the trash (and was trashed at or before `trashedBy`, when given): its
 * shares, its rows (pages, snapshots, comments, review link, file rows), then
 * its files. The trash state is confirmed under a lock on the project's row,
 * in the same transaction as the deletes, so a restore that lands first
 * wins and one that comes later waits and finds nothing. False when it was
 * no longer there to delete. Files go only after the rows are committed; one
 * a failed delete leaves behind has no row, so the daily sweep removes it.
 */
export async function purgeProject(
  db: Database,
  services: PurgeServices,
  workspaceId: string,
  projectId: string,
  trashedBy?: number,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const { rows: trashed } = await tx.query(
      `SELECT 1 FROM projects
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NOT NULL
         AND ($3::timestamptz IS NULL OR deleted_at <= $3)
       FOR UPDATE`,
      [workspaceId, projectId, trashedBy === undefined ? null : toDate(trashedBy)],
    );
    if (trashed.length === 0) return null;
    const shares = createPostgresStore(tx);
    const shareFiles = [];
    for (const id of await projectShareIds(tx, workspaceId, projectId)) {
      shareFiles.push(...(await shares.remove(id)));
    }
    await tx.query("DELETE FROM projects WHERE workspace_id = $1 AND id = $2", [
      workspaceId,
      projectId,
    ]);
    // 019's foreign key kept the file rows, without their project.
    const { rows: files } = await tx.query<{ bytes: Uint8Array | null; blob_url: string | null }>(
      `DELETE FROM workspace_blobs
       WHERE workspace_id = $1 AND project_id IS NULL AND starts_with(key, $2)
       RETURNING bytes, blob_url`,
      [workspaceId, projectBlobPrefix(workspaceId, projectId)],
    );
    return { shareFiles, files: files.map(toLocation) };
  });
  if (!removed) return false;
  await services.shareBlobs.discard(removed.shareFiles);
  await services.blobs.discard(removed.files);
  return true;
}

/** Deletes projects trashed more than `TRASH_GRACE_MS` before `now`, oldest first, until `deadline`. */
export async function purgeTrash(
  db: Database,
  services: PurgeServices,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  let count = 0;
  for (;;) {
    const cutoff = now - TRASH_GRACE_MS;
    const { rows } = await db.query<{ workspace_id: string; id: string }>(
      `SELECT workspace_id, id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= $1
       ORDER BY deleted_at, id LIMIT $2`,
      [toDate(cutoff), BATCH],
    );
    for (const row of rows) {
      if (Date.now() >= deadline) return { count, done: false };
      // Restored (or trashed again) since the list was read: purgeProject skips it.
      if (await purgeProject(db, services, row.workspace_id, row.id, cutoff)) count += 1;
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
 * Whether a row records the file at `path`: a project file or a logo (under
 * `ws/`), or an avatar (under `user/`). Null for any other path, which the
 * sweep never touches.
 */
async function isRecorded(db: Queryable, path: string): Promise<boolean | null> {
  const owner = parseBlobPath(path) ?? parseBrandLogoPath(path);
  if (owner) return blobRowExists(db, owner.workspaceId, path);
  const avatar = parseAvatarPath(path);
  return avatar && avatarRowExists(db, avatar.userId, path);
}

/**
 * Vercel Blob files under `prefix` that no row records, uploaded more than
 * `UNCOMMITTED_BLOB_MS` before `now`: an upload whose commit never came, or
 * the file of a row deleted with its workspace or account whose own delete
 * failed. Paths `isRecorded` doesn't know are never touched.
 */
async function sweepUnrecorded(
  db: Queryable,
  blobs: ClientUploadDriver,
  prefix: string,
  now: number,
  deadline: number,
) {
  let count = 0;
  let cursor: string | undefined;
  do {
    if (Date.now() >= deadline) return { count, done: false };
    const page = await blobs.list(prefix, cursor);
    const stale: string[] = [];
    for (const file of page.files) {
      if (file.uploadedAt.getTime() >= now - UNCOMMITTED_BLOB_MS) continue;
      if ((await isRecorded(db, file.pathname)) === false) stale.push(file.url);
    }
    await blobs.discard(stale.map((url) => ({ kind: "vercel", url })));
    count += stale.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { count, done: true };
}

/** Both prefixes' unrecorded files; inline files live in their rows, so there's nothing to list. */
async function sweepUncommitted(
  db: Queryable,
  blobs: AnyBlobDriver,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  if (blobs.kind !== "vercel") return { count: 0, done: true };
  let count = 0;
  for (const prefix of [WORKSPACE_BLOB_PREFIX, USER_BLOB_PREFIX]) {
    const swept = await sweepUnrecorded(db, blobs, prefix, now, deadline);
    count += swept.count;
    if (!swept.done) return { count, done: false };
  }
  return { count, done: true };
}

/** Both sweeps; `count` is the files deleted, avatars included. */
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
