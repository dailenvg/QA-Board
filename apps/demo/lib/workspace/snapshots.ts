import type { Queryable } from "../share/migrate";
import type { Snapshot } from "../store/types";
import type { SnapshotInput } from "./schemas";
import { toDate, toMs } from "./times";
import { done, refuse, type QueryResult } from "./query-result";

/** Snapshots are reached through their project, so only the workspace's live projects' are. */

interface SnapshotRow {
  project_id: string;
  id: string;
  blob_key: string;
  width: number;
  height: number;
  scale: number;
  source_url: string;
  created_at: Date;
}

function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    width: row.width,
    height: row.height,
    createdAt: toMs(row.created_at),
    blobKey: row.blob_key,
    sourceUrl: row.source_url,
    ...(row.scale < 1 ? { scale: row.scale } : {}),
  };
}

/** The snapshots of the workspace's live projects (or of one), oldest first. */
export async function listSnapshots(
  db: Queryable,
  workspaceId: string,
  projectId?: string,
): Promise<Snapshot[]> {
  const { rows } = await db.query<SnapshotRow>(
    `SELECT snapshot.project_id, snapshot.id, snapshot.blob_key, snapshot.width, snapshot.height,
       snapshot.scale, snapshot.source_url, snapshot.created_at
     FROM snapshots AS snapshot
     JOIN projects AS project ON project.id = snapshot.project_id
     WHERE project.workspace_id = $1 AND project.deleted_at IS NULL
       AND ($2::text IS NULL OR project.id = $2)
     ORDER BY snapshot.created_at, snapshot.id`,
    [workspaceId, projectId ?? null],
  );
  return rows.map(toSnapshot);
}

/** Adds a snapshot to a live project; never replaces one. Run the project check first for a 404. */
export async function addSnapshot(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  input: SnapshotInput,
): Promise<QueryResult<Snapshot>> {
  const { rows } = await db.query<SnapshotRow>(
    `INSERT INTO snapshots (project_id, id, blob_key, width, height, scale, source_url, created_at)
     SELECT project.id, $3, $4, $5, $6, $7, $8, $9 FROM projects AS project
     WHERE project.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
     ON CONFLICT (project_id, id) DO NOTHING
     RETURNING project_id, id, blob_key, width, height, scale, source_url, created_at`,
    [
      workspaceId,
      projectId,
      input.id,
      input.blobKey,
      input.width,
      input.height,
      input.scale ?? 1,
      input.sourceUrl,
      toDate(input.createdAt),
    ],
  );
  return rows[0] ? done(toSnapshot(rows[0])) : refuse("exists");
}

/** Deletes a snapshot (and the comments on it). False when the workspace has no such snapshot. */
export async function deleteSnapshot(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  id: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `DELETE FROM snapshots AS snapshot USING projects AS project
     WHERE project.id = snapshot.project_id AND project.workspace_id = $1
       AND project.deleted_at IS NULL AND snapshot.project_id = $2 AND snapshot.id = $3
     RETURNING snapshot.id`,
    [workspaceId, projectId, id],
  );
  return rows.length === 1;
}
