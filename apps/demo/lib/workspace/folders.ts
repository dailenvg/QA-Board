import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import type { Folder } from "../store/types";
import type { FolderCreate, FolderPatch } from "./schemas";
import { toDate, toMs } from "./times";
import { done, refuse, type QueryResult } from "./query-result";

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: Date;
}

const COLUMNS = "id, name, parent_id, created_at";

function toFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, parentId: row.parent_id, createdAt: toMs(row.created_at) };
}

export async function listFolders(db: Queryable, workspaceId: string): Promise<Folder[]> {
  const { rows } = await db.query<FolderRow>(
    `SELECT ${COLUMNS} FROM folders WHERE workspace_id = $1 ORDER BY created_at, id`,
    [workspaceId],
  );
  return rows.map(toFolder);
}

async function folderExists(db: Queryable, workspaceId: string, id: string): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM folders WHERE workspace_id = $1 AND id = $2", [
    workspaceId,
    id,
  ]);
  return rows.length === 1;
}

/** A new folder; never replaces one with the same id. */
export async function createFolder(
  db: Queryable,
  workspaceId: string,
  input: FolderCreate,
  now: number,
): Promise<QueryResult<Folder>> {
  if (input.parentId && !(await folderExists(db, workspaceId, input.parentId))) {
    return refuse("unknown-parent");
  }
  const { rows } = await db.query<FolderRow>(
    `INSERT INTO folders (workspace_id, id, parent_id, name, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, id) DO NOTHING RETURNING ${COLUMNS}`,
    [workspaceId, input.id, input.parentId, input.name, toDate(input.createdAt ?? now)],
  );
  return rows[0] ? done(toFolder(rows[0])) : refuse("exists");
}

/** True when `parentId` is `id` or sits somewhere inside it. */
async function wouldCycle(db: Queryable, workspaceId: string, id: string, parentId: string) {
  const { rows } = await db.query(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id FROM folders WHERE workspace_id = $1 AND id = $3
       UNION
       SELECT folder.id, folder.parent_id FROM folders AS folder
       JOIN chain ON folder.workspace_id = $1 AND folder.id = chain.parent_id
     )
     SELECT 1 FROM chain WHERE id = $2`,
    [workspaceId, id, parentId],
  );
  return rows.length > 0;
}

/** Renames and/or moves a folder. Moving it into itself or its own subfolder is refused. */
export async function updateFolder(
  db: Queryable,
  workspaceId: string,
  id: string,
  patch: FolderPatch,
): Promise<QueryResult<Folder>> {
  if (!(await folderExists(db, workspaceId, id))) return refuse("not-found");
  if (patch.parentId) {
    if (!(await folderExists(db, workspaceId, patch.parentId))) return refuse("unknown-parent");
    if (await wouldCycle(db, workspaceId, id, patch.parentId)) return refuse("cycle");
  }
  const { rows } = await db.query<FolderRow>(
    `UPDATE folders SET
       name = COALESCE($3, name),
       parent_id = CASE WHEN $4::boolean THEN $5 ELSE parent_id END
     WHERE workspace_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    [workspaceId, id, patch.name ?? null, patch.parentId !== undefined, patch.parentId ?? null],
  );
  return rows[0] ? done(toFolder(rows[0])) : refuse("not-found");
}

/** The folder and every folder inside it. */
const SUBTREE = `WITH RECURSIVE subtree AS (
  SELECT id FROM folders WHERE workspace_id = $1 AND id = $2
  UNION
  SELECT folder.id FROM folders AS folder
  JOIN subtree ON folder.workspace_id = $1 AND folder.parent_id = subtree.id
)`;

/** Thrown inside the delete's transaction to undo it: a live project is in the folder. */
class NotEmpty extends Error {}

/**
 * Deletes the folder and its subfolders, while no live project is in them
 * (`not-empty`). Trashed projects inside move to the workspace root, still
 * trashed, so they stay restorable for the rest of their grace period (and a
 * restore brings them back at the root). The folders are locked first, so a
 * project can't be created in or moved into them meanwhile. Returns the ids
 * of the projects it moved.
 */
export async function deleteFolder(
  db: Database,
  workspaceId: string,
  id: string,
): Promise<QueryResult<string[]>> {
  try {
    return await db.transaction(async (tx) => {
      const { rows: locked } = await tx.query(
        `${SUBTREE}
         SELECT id FROM folders WHERE workspace_id = $1 AND id IN (SELECT id FROM subtree)
         FOR UPDATE`,
        [workspaceId, id],
      );
      if (locked.length === 0) return refuse("not-found");
      const { rows: moved } = await tx.query<{ id: string }>(
        `${SUBTREE}
         UPDATE projects SET folder_id = NULL
         WHERE workspace_id = $1 AND deleted_at IS NOT NULL
           AND folder_id IN (SELECT id FROM subtree)
         RETURNING id`,
        [workspaceId, id],
      );
      const { rows: deleted } = await tx.query(
        `${SUBTREE}
         DELETE FROM folders WHERE workspace_id = $1 AND id = $2 AND NOT EXISTS (
           SELECT 1 FROM projects WHERE workspace_id = $1 AND folder_id IN (SELECT id FROM subtree)
         ) RETURNING id`,
        [workspaceId, id],
      );
      if (deleted.length === 0) throw new NotEmpty();
      return done(moved.map((row) => row.id));
    });
  } catch (error) {
    if (error instanceof NotEmpty) return refuse("not-empty");
    throw error;
  }
}
