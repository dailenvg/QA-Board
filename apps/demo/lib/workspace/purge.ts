import { audit } from "../account/audit";
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
 * Which projects a purge may delete: one in the trash (trashed at or before
 * `by`, when given), or one archived whose deletion date has come by `by`,
 * in the trash or not (the date shown on it is the promise). Never one that
 * was restored, unarchived, or whose date is still to come.
 */
export type PurgeReason = { kind: "trashed"; by?: number } | { kind: "archive-due"; by: number };

const DUE: Record<PurgeReason["kind"], string> = {
  trashed: "deleted_at IS NOT NULL AND ($3::timestamptz IS NULL OR deleted_at <= $3)",
  "archive-due": "archived_at IS NOT NULL AND delete_after IS NOT NULL AND delete_after <= $3",
};

/** Locks the project if `reason` still holds for it; false once it doesn't (or it's gone). */
async function lockDue(tx: Queryable, workspaceId: string, projectId: string, reason: PurgeReason) {
  const { rows } = await tx.query(
    `SELECT 1 FROM projects WHERE workspace_id = $1 AND id = $2 AND ${DUE[reason.kind]} FOR UPDATE`,
    [workspaceId, projectId, reason.by === undefined ? null : toDate(reason.by)],
  );
  return rows.length === 1;
}

/**
 * Deletes one project of the workspace for good, if `reason` still holds for
 * it (still in the trash, or still archived and due): its shares, its rows
 * (pages, snapshots, comments, review link, file rows), then its files. The
 * reason is confirmed under a lock on the project's row, in the same
 * transaction as the deletes, so a restore or unarchive that lands first
 * wins and one that comes later waits and finds nothing. An archived project
 * leaves an audit entry, since nobody deleted it but the date. False when it
 * was no longer there to delete. Files go only after the rows are committed;
 * one a failed delete leaves behind has no row, so the daily sweep removes it.
 */
export async function purgeProject(
  db: Database,
  services: PurgeServices,
  workspaceId: string,
  projectId: string,
  reason: PurgeReason = { kind: "trashed" },
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    if (!(await lockDue(tx, workspaceId, projectId, reason))) return null;
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
    if (reason.kind === "archive-due") {
      await audit(
        tx,
        {
          actorUserId: null,
          workspaceId,
          action: "project.deleted",
          target: { type: "project", id: projectId },
          fields: ["archive-expired"],
        },
        reason.by,
      );
    }
    return { shareFiles, files: files.map(toLocation) };
  });
  if (!removed) return false;
  await services.shareBlobs.discard(removed.shareFiles);
  await services.blobs.discard(removed.files);
  return true;
}

/**
 * Deletes, oldest first and `BATCH` at a time, the projects `candidates`
 * lists for `reason`, until `deadline`. A project whose reason no longer
 * holds by the time it's locked (restored, unarchived) is skipped.
 */
async function purgeDue(
  db: Database,
  services: PurgeServices,
  reason: PurgeReason,
  candidates: string,
  deadline: number,
): Promise<PurgeResult> {
  let count = 0;
  for (;;) {
    const { rows } = await db.query<{ workspace_id: string; id: string }>(candidates, [
      toDate(reason.by ?? 0),
      BATCH,
    ]);
    for (const row of rows) {
      if (Date.now() >= deadline) return { count, done: false };
      if (await purgeProject(db, services, row.workspace_id, row.id, reason)) count += 1;
    }
    if (rows.length < BATCH) return { count, done: true };
  }
}

/** Deletes projects trashed more than `TRASH_GRACE_MS` before `now`, oldest first, until `deadline`. */
export function purgeTrash(
  db: Database,
  services: PurgeServices,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  return purgeDue(
    db,
    services,
    { kind: "trashed", by: now - TRASH_GRACE_MS },
    `SELECT workspace_id, id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= $1
     ORDER BY deleted_at, id LIMIT $2`,
    deadline,
  );
}

/**
 * Deletes archived projects whose deletion date (`delete_after`, 30 days
 * after archiving) is at or before `now`, soonest due first, until `deadline`.
 * No warning goes out: the date shows on the project from the day it's archived.
 */
export function purgeArchived(
  db: Database,
  services: PurgeServices,
  now: number,
  deadline: number,
): Promise<PurgeResult> {
  return purgeDue(
    db,
    services,
    { kind: "archive-due", by: now },
    `SELECT workspace_id, id FROM projects
     WHERE archived_at IS NOT NULL AND delete_after IS NOT NULL AND delete_after <= $1
     ORDER BY delete_after, id LIMIT $2`,
    deadline,
  );
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
