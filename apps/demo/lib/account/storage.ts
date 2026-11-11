import type { Queryable } from "../share/migrate";
import { storageSummary } from "../workspace/blobs";
import { TRASH_GRACE_MS } from "../workspace/limits";
import { toMs, toMsOrNull } from "../workspace/times";
import type { LargeProject, StorageReport } from "./schemas";
import { bucketOf, STORAGE_BUCKETS, type StorageBucket } from "./storage-buckets";

/**
 * The Storage page's report on one workspace. Used bytes and the file count
 * come from storage_usage (kept by trigger), the breakdown and the largest
 * projects from the file rows themselves. Trashed projects count: their files
 * stay until the purge deletes them.
 */

/** How many projects "large projects" lists. */
export const LARGE_PROJECTS_LIMIT = 10;

interface BucketRow {
  kind: string | null;
  video: boolean;
  origin: string | null;
  bytes: string | number;
  files: number;
}

/** Bytes and files per bucket, every bucket in order. */
async function bucketTotals(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<BucketRow>(
    `SELECT
       CASE WHEN split_part(blob.key, '/', 3) = 'project' THEN split_part(blob.key, '/', 5) END
         AS kind,
       blob.content_type LIKE 'video/%' AS video,
       project.source->>'origin' AS origin,
       sum(blob.size) AS bytes,
       count(*)::int AS files
     FROM workspace_blobs AS blob
     LEFT JOIN projects AS project
       ON project.workspace_id = blob.workspace_id AND project.id = blob.project_id
     WHERE blob.workspace_id = $1
     GROUP BY 1, 2, 3`,
    [workspaceId],
  );
  const totals = new Map<StorageBucket, { bytes: number; files: number }>(
    STORAGE_BUCKETS.map((bucket) => [bucket, { bytes: 0, files: 0 }]),
  );
  for (const row of rows) {
    const total = totals.get(bucketOf(row));
    if (!total) continue;
    total.bytes += Number(row.bytes);
    total.files += row.files;
  }
  return STORAGE_BUCKETS.map((bucket) => ({
    bucket,
    ...(totals.get(bucket) ?? { bytes: 0, files: 0 }),
  }));
}

interface ProjectRow {
  id: string;
  name: string;
  delete_after: Date | null;
  deleted_at: Date | null;
  archived_at: Date | null;
  bytes: string | number;
  files: number;
}

/** When a trashed or archived project is due to go; trashed wins, as the purge reads it first. */
function toLargeProject(row: ProjectRow): LargeProject {
  const base = { id: row.id, name: row.name, bytes: Number(row.bytes), files: row.files };
  if (row.deleted_at) {
    return { ...base, status: "trashed", deleteAfter: toMs(row.deleted_at) + TRASH_GRACE_MS };
  }
  if (row.archived_at) {
    return { ...base, status: "archived", deleteAfter: toMsOrNull(row.delete_after) };
  }
  return { ...base, status: "live", deleteAfter: null };
}

/** The workspace's projects that store anything, biggest first (ties by name). */
async function largeProjects(db: Queryable, workspaceId: string): Promise<LargeProject[]> {
  const { rows } = await db.query<ProjectRow>(
    `SELECT project.id, project.name, project.delete_after, project.deleted_at,
       project.archived_at, sum(blob.size) AS bytes, count(*)::int AS files
     FROM workspace_blobs AS blob
     JOIN projects AS project
       ON project.workspace_id = blob.workspace_id AND project.id = blob.project_id
     WHERE blob.workspace_id = $1
     GROUP BY project.id
     ORDER BY bytes DESC, project.name, project.id
     LIMIT $2`,
    [workspaceId, LARGE_PROJECTS_LIMIT],
  );
  return rows.map(toLargeProject);
}

export async function loadStorageReport(
  db: Queryable,
  workspaceId: string,
): Promise<StorageReport> {
  const [summary, buckets, projects] = await Promise.all([
    storageSummary(db, workspaceId),
    bucketTotals(db, workspaceId),
    largeProjects(db, workspaceId),
  ]);
  return {
    usedBytes: summary.bytes,
    quotaBytes: summary.quotaBytes,
    files: summary.blobCount,
    buckets,
    largeProjects: projects,
  };
}
