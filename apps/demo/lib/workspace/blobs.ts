import type { Queryable } from "../share/migrate";
import type { BlobLocation } from "../share/types";
import { blobPath } from "./blob-paths";
import { done, refuse, type QueryResult } from "./query-result";
import type { StorageSummary } from "./types";

/**
 * A workspace's file rows. Each row's key is the file's storage path
 * (`blob-paths.ts`); routes take a project id and a logical key and build the
 * path from the session's workspace, so a request can only ever name its own
 * workspace's files. storage_usage follows these rows by trigger (020).
 */

interface BlobRow {
  key: string;
  content_type: string;
  size: string | number;
  bytes: Uint8Array | null;
  blob_url: string | null;
}

export interface WorkspaceBlob {
  path: string;
  contentType: string;
  size: number;
  location: BlobLocation;
}

export function toLocation(row: Pick<BlobRow, "bytes" | "blob_url">): BlobLocation {
  return row.blob_url
    ? { kind: "vercel", url: row.blob_url }
    : { kind: "inline", bytes: new Uint8Array(row.bytes ?? []) };
}

function toBlob(row: BlobRow): WorkspaceBlob {
  return {
    path: row.key,
    contentType: row.content_type,
    size: Number(row.size),
    location: toLocation(row),
  };
}

/** A live project's file, by its logical key. */
export async function findBlob(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  key: string,
): Promise<WorkspaceBlob | null> {
  const { rows } = await db.query<BlobRow>(
    `SELECT blob.key, blob.content_type, blob.size, blob.bytes, blob.blob_url
     FROM workspace_blobs AS blob
     JOIN projects AS project
       ON project.workspace_id = blob.workspace_id AND project.id = blob.project_id
     WHERE blob.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
       AND blob.key = $3`,
    [workspaceId, projectId, blobPath(workspaceId, projectId, key)],
  );
  return rows[0] ? toBlob(rows[0]) : null;
}

/** Whether a row exists at `path` (any project, live or not). */
export async function blobRowExists(
  db: Queryable,
  workspaceId: string,
  path: string,
): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM workspace_blobs WHERE workspace_id = $1 AND key = $2",
    [workspaceId, path],
  );
  return rows.length === 1;
}

/** Bytes stored, files, and the workspace's quota. */
export async function storageSummary(db: Queryable, workspaceId: string): Promise<StorageSummary> {
  const { rows } = await db.query<{
    bytes: string | number | null;
    blob_count: number | null;
    quota: string | number;
  }>(
    `SELECT usage.bytes, usage.blob_count, workspace.storage_quota_bytes AS quota
     FROM workspaces AS workspace
     LEFT JOIN storage_usage AS usage ON usage.workspace_id = workspace.id
     WHERE workspace.id = $1`,
    [workspaceId],
  );
  const row = rows[0];
  return {
    bytes: Number(row?.bytes ?? 0),
    blobCount: Number(row?.blob_count ?? 0),
    quotaBytes: Number(row?.quota ?? 0),
  };
}

/** Whether `size` more bytes fit the workspace's quota right now. */
export async function fitsQuota(db: Queryable, workspaceId: string, size: number) {
  const { bytes, quotaBytes } = await storageSummary(db, workspaceId);
  return bytes + size <= quotaBytes;
}

/** Whether the workspace is waiting to be deleted (033): nothing new is stored in it. */
async function isPendingDeletion(db: Queryable, workspaceId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM workspaces WHERE id = $1 AND delete_after IS NOT NULL",
    [workspaceId],
  );
  return rows.length === 1;
}

export interface NewBlob {
  projectId: string;
  key: string;
  contentType: string;
  size: number;
  location: BlobLocation;
}

/**
 * Records a stored file under a live project of the workspace, within its
 * quota; `not-found` once the workspace is waiting to be deleted (an upload
 * token issued before that). Run inside a transaction: the usage row is
 * locked, so two commits can't both squeeze into the last bytes. Never
 * replaces a row: a second commit of the same file (the upload callback
 * racing the browser) is `exists`.
 */
export async function recordBlob(
  tx: Queryable,
  workspaceId: string,
  blob: NewBlob,
): Promise<QueryResult<"created" | "exists">> {
  const path = blobPath(workspaceId, blob.projectId, blob.key);
  const { rows: usage } = await tx.query<{ bytes: string | number; quota: string | number }>(
    `SELECT usage.bytes, workspace.storage_quota_bytes AS quota
     FROM storage_usage AS usage JOIN workspaces AS workspace ON workspace.id = usage.workspace_id
     WHERE usage.workspace_id = $1 FOR UPDATE OF usage`,
    [workspaceId],
  );
  if (await blobRowExists(tx, workspaceId, path)) return done("exists");
  // Its own statement, so it sees a deletion scheduled while this waited for the lock.
  if (await isPendingDeletion(tx, workspaceId)) return refuse("not-found");
  const used = usage[0];
  if (!used || Number(used.bytes) + blob.size > Number(used.quota)) return refuse("quota");
  const inline = blob.location.kind === "inline" ? blob.location.bytes : null;
  const url = blob.location.kind === "vercel" ? blob.location.url : null;
  const { rows } = await tx.query(
    `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes, blob_url)
     SELECT project.workspace_id, $3, project.id, $4, $5, $6, $7 FROM projects AS project
     WHERE project.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
     ON CONFLICT (workspace_id, key) DO NOTHING RETURNING key`,
    [workspaceId, blob.projectId, path, blob.contentType, blob.size, inline, url],
  );
  if (rows.length === 1) return done("created");
  return (await blobRowExists(tx, workspaceId, path)) ? done("exists") : refuse("not-found");
}

/** Deletes a live project's file row; returns where the file was, for the driver to delete. */
export async function deleteBlob(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  key: string,
): Promise<BlobLocation | null> {
  const { rows } = await db.query<BlobRow>(
    `DELETE FROM workspace_blobs AS blob USING projects AS project
     WHERE project.workspace_id = blob.workspace_id AND project.id = blob.project_id
       AND blob.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
       AND blob.key = $3
     RETURNING blob.key, blob.content_type, blob.size, blob.bytes, blob.blob_url`,
    [workspaceId, projectId, blobPath(workspaceId, projectId, key)],
  );
  return rows[0] ? toLocation(rows[0]) : null;
}

/**
 * Rows of project files whose project is gone (`project_id` set to null by
 * 019's foreign key), oldest first: what the cron deletes, files first.
 */
export async function orphanedBlobRows(
  db: Queryable,
  limit: number,
): Promise<Array<{ workspaceId: string; path: string; location: BlobLocation }>> {
  const { rows } = await db.query<BlobRow & { workspace_id: string }>(
    `SELECT workspace_id, key, content_type, size, bytes, blob_url FROM workspace_blobs
     WHERE project_id IS NULL AND key LIKE 'ws/%/project/%'
     ORDER BY created_at LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    path: row.key,
    location: toLocation(row),
  }));
}

export async function deleteBlobRows(
  db: Queryable,
  rows: ReadonlyArray<{ workspaceId: string; path: string }>,
): Promise<void> {
  for (const { workspaceId, path } of rows) {
    await db.query(
      "DELETE FROM workspace_blobs WHERE workspace_id = $1 AND key = $2 AND project_id IS NULL",
      [workspaceId, path],
    );
  }
}
