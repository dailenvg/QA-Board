import { listCronRuns, type CronRun } from "../cron/cron-runs";
import type { Queryable } from "../share/migrate";

/**
 * The admin panel's Storage page: what Squint stores, the workspaces and
 * projects that store the most, and the cleanup's last run. Read-only; the
 * orphan check and Run sweep are actions of their own (`orphans.ts`,
 * `/api/admin/sweep`). Workspaces' sizes come from storage_usage, as on the
 * Workspaces page and the Overview; projects' from their file rows, as on a
 * workspace's own Storage page.
 */

/** How many workspaces and projects each list shows. */
export const TOP_STORAGE_LIMIT = 10;

export interface StorageWorkspace {
  id: string;
  name: string;
  /** The owner's sign-in email; null when the workspace has no owner row. */
  ownerEmail: string | null;
  usedBytes: number;
  quotaBytes: number;
}

export interface StorageProject {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  bytes: number;
  files: number;
  /** In the trash: its files stay until the purge deletes it. */
  trashed: boolean;
}

export interface AdminStorage {
  /** Bytes and files across every workspace (storage_usage). */
  totalBytes: number;
  totalFiles: number;
  /** Workspaces storing anything, biggest first. */
  workspaces: StorageWorkspace[];
  /** Projects storing anything, trashed ones included, biggest first. */
  projects: StorageProject[];
  /** The cleanup's latest run, by the schedule or the admin; null before the first. */
  lastRun: CronRun | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  owner_email: string | null;
  used_bytes: string | number;
  quota_bytes: string | number;
}

async function topWorkspaces(db: Queryable): Promise<StorageWorkspace[]> {
  const { rows } = await db.query<WorkspaceRow>(
    `SELECT w.id, w.name, owner.email AS owner_email, usage.bytes AS used_bytes,
       w.storage_quota_bytes AS quota_bytes
     FROM storage_usage AS usage
     JOIN workspaces AS w ON w.id = usage.workspace_id
     LEFT JOIN memberships AS ownership ON ownership.workspace_id = w.id AND ownership.role = 'owner'
     LEFT JOIN users AS owner ON owner.id = ownership.user_id
     WHERE usage.bytes > 0
     ORDER BY usage.bytes DESC, lower(w.name), w.id
     LIMIT $1`,
    [TOP_STORAGE_LIMIT],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerEmail: row.owner_email,
    usedBytes: Number(row.used_bytes),
    quotaBytes: Number(row.quota_bytes),
  }));
}

interface ProjectRow {
  id: string;
  name: string;
  workspace_id: string;
  workspace_name: string;
  bytes: string | number;
  files: number;
  trashed: boolean;
}

async function topProjects(db: Queryable): Promise<StorageProject[]> {
  const { rows } = await db.query<ProjectRow>(
    `SELECT project.id, project.name, w.id AS workspace_id, w.name AS workspace_name,
       sum(blob.size) AS bytes, count(*)::int AS files,
       (project.deleted_at IS NOT NULL) AS trashed
     FROM workspace_blobs AS blob
     JOIN projects AS project
       ON project.workspace_id = blob.workspace_id AND project.id = blob.project_id
     JOIN workspaces AS w ON w.id = project.workspace_id
     GROUP BY project.workspace_id, project.id, w.id
     ORDER BY bytes DESC, lower(project.name), project.id
     LIMIT $1`,
    [TOP_STORAGE_LIMIT],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    bytes: Number(row.bytes),
    files: row.files,
    trashed: row.trashed,
  }));
}

async function totals(db: Queryable): Promise<{ bytes: number; files: number }> {
  const { rows } = await db.query<{ bytes: string | number; files: string | number }>(
    "SELECT coalesce(sum(bytes), 0) AS bytes, coalesce(sum(blob_count), 0) AS files FROM storage_usage",
  );
  return { bytes: Number(rows[0]?.bytes ?? 0), files: Number(rows[0]?.files ?? 0) };
}

export async function loadAdminStorage(db: Queryable, now: number): Promise<AdminStorage> {
  const [total, workspaces, projects, runs] = await Promise.all([
    totals(db),
    topWorkspaces(db),
    topProjects(db),
    listCronRuns(db, 1, now),
  ]);
  return {
    totalBytes: total.bytes,
    totalFiles: total.files,
    workspaces,
    projects,
    lastRun: runs[0] ?? null,
  };
}
