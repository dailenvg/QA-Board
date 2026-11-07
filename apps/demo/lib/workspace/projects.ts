import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import type { Page, PagesSource, ProjectSource } from "../store/types";
import { placeFrameComments } from "./comments";
import { pagesByProject, replacePages } from "./pages";
import type { ProjectCreate, ProjectPatch, SourceInput } from "./schemas";
import { toDate, toMs, toMsOrNull } from "./times";
import { done, refuse, type QueryResult } from "./query-result";
import type { TrashedProject, WorkspaceProject } from "./types";

interface ProjectRow {
  id: string;
  folder_id: string | null;
  name: string;
  source: StoredSource;
  label: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  share_id: string | null;
  share_created_at: string | number | null;
  share_cursor: string | number | null;
  share_synced_at: Date | null;
}

/** A project row with its review link, if it has one (never the link's secrets). */
const SELECT = `SELECT project.id, project.folder_id, project.name, project.source, project.label,
    project.archived_at, project.created_at, project.updated_at, project.deleted_at,
    link.share_id, share.created_at AS share_created_at, link.cursor AS share_cursor,
    link.last_synced_at AS share_synced_at
  FROM projects AS project
  LEFT JOIN project_share_links AS link
    ON link.workspace_id = project.workspace_id AND link.project_id = project.id
  LEFT JOIN squint_shares AS share ON share.id = link.share_id`;

const LIVE = "project.deleted_at IS NULL";

/** What `projects.source` holds: a page project's pages live in the `pages` table instead. */
type StoredSource = Exclude<ProjectSource, PagesSource> | Omit<PagesSource, "pages">;

/** What `projects.source` keeps: a page project's pages go to the `pages` table. */
export function storedSource(source: SourceInput): StoredSource {
  if (source.kind === "url") return { kind: "url", url: source.url };
  const { origin, fileName, referenceUrl } = source;
  return { kind: "pages", origin, fileName, ...(referenceUrl ? { referenceUrl } : {}) };
}

function toSource(stored: StoredSource, pages: Page[]): ProjectSource {
  return stored.kind === "url" ? stored : { ...stored, pages };
}

function toProject(row: ProjectRow, pages: Map<string, Page[]>): WorkspaceProject {
  const project: WorkspaceProject = {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    source: toSource(row.source, pages.get(row.id) ?? []),
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
    label: row.label,
    archivedAt: toMsOrNull(row.archived_at),
  };
  if (row.share_id) {
    project.share = {
      id: row.share_id,
      createdAt: Number(row.share_created_at),
      cursor: Number(row.share_cursor),
      ...(row.share_synced_at ? { lastSyncedAt: toMs(row.share_synced_at) } : {}),
    };
  }
  return project;
}

async function withPages(db: Queryable, workspaceId: string, rows: ProjectRow[]) {
  const pages = await pagesByProject(
    db,
    workspaceId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toProject(row, pages));
}

/** The workspace's live projects (archived ones included), oldest first. */
export async function listProjects(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceProject[]> {
  const { rows } = await db.query<ProjectRow>(
    `${SELECT} WHERE project.workspace_id = $1 AND ${LIVE} ORDER BY project.created_at, project.id`,
    [workspaceId],
  );
  return withPages(db, workspaceId, rows);
}

/** The workspace's trashed projects, most recently deleted first. */
export async function listTrash(db: Queryable, workspaceId: string): Promise<TrashedProject[]> {
  const { rows } = await db.query<ProjectRow>(
    `${SELECT} WHERE project.workspace_id = $1 AND project.deleted_at IS NOT NULL
     ORDER BY project.deleted_at DESC, project.id`,
    [workspaceId],
  );
  const projects = await withPages(db, workspaceId, rows);
  return projects.map((project, index) => ({
    ...project,
    deletedAt: toMs(rows[index]?.deleted_at ?? 0),
  }));
}

/** A live project of the workspace, or null (another workspace's, trashed and unknown alike). */
export async function getProject(
  db: Queryable,
  workspaceId: string,
  id: string,
): Promise<WorkspaceProject | null> {
  const { rows } = await db.query<ProjectRow>(
    `${SELECT} WHERE project.workspace_id = $1 AND project.id = $2 AND ${LIVE}`,
    [workspaceId, id],
  );
  const [project] = await withPages(db, workspaceId, rows);
  return project ?? null;
}

/** Whether `id` is a live project of the workspace: the check every child route makes first. */
export async function isLiveProject(
  db: Queryable,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM projects AS project WHERE project.workspace_id = $1 AND project.id = $2 AND ${LIVE}`,
    [workspaceId, id],
  );
  return rows.length === 1;
}

async function folderExists(db: Queryable, workspaceId: string, id: string) {
  const { rows } = await db.query("SELECT 1 FROM folders WHERE workspace_id = $1 AND id = $2", [
    workspaceId,
    id,
  ]);
  return rows.length === 1;
}

/**
 * Inserts a project and its pages; never replaces a project. Its id is
 * unique across workspaces, so `exists` doesn't say whose it is. Run inside
 * `createProject`'s transaction.
 */
async function insertProject(
  tx: Queryable,
  workspaceId: string,
  input: ProjectCreate & { updatedAt?: number },
  now: number,
): Promise<QueryResult<null>> {
  if (!(await folderExists(tx, workspaceId, input.folderId))) return refuse("unknown-folder");
  const createdAt = input.createdAt ?? now;
  const { rows } = await tx.query(
    `INSERT INTO projects (id, workspace_id, folder_id, name, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [
      input.id,
      workspaceId,
      input.folderId,
      input.name,
      JSON.stringify(storedSource(input.source)),
      toDate(createdAt),
      toDate(input.updatedAt ?? createdAt),
    ],
  );
  if (rows.length === 0) return refuse("exists");
  if (input.source.kind === "pages") {
    await replacePages(tx, workspaceId, input.id, input.source.pages);
  }
  return done(null);
}

export async function createProject(
  db: Database,
  workspaceId: string,
  input: ProjectCreate,
  now: number,
): Promise<QueryResult<WorkspaceProject>> {
  const inserted = await db.transaction((tx) => insertProject(tx, workspaceId, input, now));
  if (!inserted.ok) return inserted;
  const project = await getProject(db, workspaceId, input.id);
  return project ? done(project) : refuse("not-found");
}

/**
 * Renames, moves and/or changes the source of a live project. A new source
 * replaces its pages (a website becoming a screenshot, a page replaced), and
 * comments on no surface move onto the first page, as in the browser.
 */
export async function updateProject(
  db: Database,
  workspaceId: string,
  id: string,
  patch: ProjectPatch,
  now: number,
): Promise<QueryResult<WorkspaceProject>> {
  const updated = await db.transaction(async (tx): Promise<QueryResult<null>> => {
    const { rows } = await tx.query(
      `SELECT 1 FROM projects AS project
       WHERE project.workspace_id = $1 AND project.id = $2 AND ${LIVE} FOR UPDATE`,
      [workspaceId, id],
    );
    if (rows.length === 0) return refuse("not-found");
    if (patch.folderId && !(await folderExists(tx, workspaceId, patch.folderId))) {
      return refuse("unknown-folder");
    }
    if (patch.source) {
      await replacePages(
        tx,
        workspaceId,
        id,
        patch.source.kind === "pages" ? patch.source.pages : [],
      );
      const [first] = patch.source.kind === "pages" ? patch.source.pages : [];
      if (first) await placeFrameComments(tx, id, first.id);
    }
    await tx.query(
      `UPDATE projects SET name = COALESCE($3, name), folder_id = COALESCE($4, folder_id),
         source = COALESCE($5::jsonb, source), updated_at = $6
       WHERE workspace_id = $1 AND id = $2`,
      [
        workspaceId,
        id,
        patch.name ?? null,
        patch.folderId ?? null,
        patch.source ? JSON.stringify(storedSource(patch.source)) : null,
        toDate(now),
      ],
    );
    return done(null);
  });
  if (!updated.ok) return updated;
  const project = await getProject(db, workspaceId, id);
  return project ? done(project) : refuse("not-found");
}

/** Runs one UPDATE on a live project of the workspace and returns it, or null when there's none. */
async function updateLive(
  db: Queryable,
  workspaceId: string,
  id: string,
  set: string,
  values: unknown[],
): Promise<WorkspaceProject | null> {
  const { rows } = await db.query(
    `UPDATE projects AS project SET ${set}
     WHERE project.workspace_id = $1 AND project.id = $2 AND ${LIVE} RETURNING id`,
    [workspaceId, id, ...values],
  );
  return rows.length === 1 ? getProject(db, workspaceId, id) : null;
}

/** Archives (or unarchives) a project: it stays, out of the main list. Archiving twice keeps the first date. */
export function setArchived(
  db: Queryable,
  workspaceId: string,
  id: string,
  archived: boolean,
  now: number,
): Promise<WorkspaceProject | null> {
  return updateLive(
    db,
    workspaceId,
    id,
    "archived_at = CASE WHEN $3::boolean THEN COALESCE(archived_at, $4) END",
    [archived, toDate(now)],
  );
}

export function setLabel(
  db: Queryable,
  workspaceId: string,
  id: string,
  label: string | null,
): Promise<WorkspaceProject | null> {
  return updateLive(db, workspaceId, id, "label = $3", [label]);
}

/** Moves a live project to the trash. Its share stops answering until it's restored. */
export async function trashProject(
  db: Queryable,
  workspaceId: string,
  id: string,
  now: number,
): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE projects AS project SET deleted_at = $3
     WHERE project.workspace_id = $1 AND project.id = $2 AND ${LIVE} RETURNING id`,
    [workspaceId, id, toDate(now)],
  );
  return rows.length === 1;
}

/** Brings a trashed project back, as it was. */
export async function restoreProject(
  db: Queryable,
  workspaceId: string,
  id: string,
): Promise<WorkspaceProject | null> {
  const { rows } = await db.query(
    `UPDATE projects SET deleted_at = NULL
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NOT NULL RETURNING id`,
    [workspaceId, id],
  );
  return rows.length === 1 ? getProject(db, workspaceId, id) : null;
}
