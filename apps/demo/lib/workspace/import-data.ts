import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { blobPath } from "./blob-paths";
import { storedSource } from "./projects";
import type { ImportData, ImportProject } from "./schemas";
import { attachShare } from "./share-links";
import { done, refuse, type QueryResult } from "./query-result";

/**
 * The one-shot import of a browser's local data into a workspace. All of it
 * runs in one transaction, so it lands whole or not at all, and it's
 * idempotent: anything whose id the workspace already has is skipped, never
 * overwritten, so importing twice changes nothing the second time. A project
 * id that another workspace already has refuses the whole import (`exists`,
 * a 409 that doesn't say whose). A project comes in whole (with its pages,
 * snapshots and comments) or not at all. Every answer lists the files the
 * workspace still lacks for the request's projects, so a browser whose
 * uploads stopped part way finds the rest by importing again.
 */

type Kind = "folders" | "projects" | "snapshots" | "comments" | "shares";
type Counts = Record<Kind, number>;

export interface ImportResult {
  imported: Counts;
  skipped: Counts;
  /**
   * The request's projects by outcome: made by this import, already in this
   * workspace (an earlier import), or already here but in the trash (its
   * files can't be uploaded until it's restored). Any other is skipped: its
   * folder isn't here. `unlinked` are imported projects whose review link
   * couldn't be proven (expired, revoked, or not this browser's), so they
   * came in without it.
   */
  projects: { imported: string[]; existing: string[]; trashed: string[]; unlinked: string[] };
  /**
   * Files the browser should upload next, by logical key: every file the
   * request's live projects point at that the workspace doesn't have yet.
   */
  uploads: Array<{ projectId: string; key: string }>;
}

const UNIQUE_VIOLATION = "23505";

/** Thrown inside the transaction to roll the whole import back as `exists`. */
class TakenElsewhere extends Error {}

const zero = (): Counts => ({ folders: 0, projects: 0, snapshots: 0, comments: 0, shares: 0 });

/** Epoch ms in a record set, as a timestamptz: exact, unlike `to_timestamp`. */
const at = (column: string) => `timestamptz 'epoch' + x.${column} * interval '1 millisecond'`;

/** The first item of each id: a repeated id is skipped like an existing one. */
function firstOfEach<T extends { id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()];
}

/** Runs an INSERT … RETURNING and counts its rows. */
async function inserted(tx: Queryable, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await tx.query<{ count: number }>(
    `WITH inserted AS (${sql}) SELECT count(*)::int AS count FROM inserted`,
    params,
  );
  return rows[0]?.count ?? 0;
}

/** True when any of `ids` is a project of another workspace. */
async function takenElsewhere(tx: Queryable, workspaceId: string, ids: string[]) {
  const { rows } = await tx.query(
    "SELECT 1 FROM projects WHERE id = ANY($2) AND workspace_id <> $1 LIMIT 1",
    [workspaceId, ids],
  );
  return rows.length > 0;
}

async function existingIds(tx: Queryable, table: "folders" | "projects", workspaceId: string) {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE workspace_id = $1`,
    [workspaceId],
  );
  return new Set(rows.map((row) => row.id));
}

/**
 * New folders, parents first. A parent that's neither new nor already in the
 * workspace, or a loop of parents, puts the folder at the top level instead.
 */
async function importFolders(tx: Queryable, workspaceId: string, data: ImportData) {
  const known = await existingIds(tx, "folders", workspaceId);
  let pending = firstOfEach(data.folders).filter((folder) => !known.has(folder.id));
  const incoming = new Set(pending.map((folder) => folder.id));
  const skipped = data.folders.length - pending.length;
  let count = 0;
  while (pending.length > 0) {
    const ready = pending.filter(
      (folder) => !folder.parentId || known.has(folder.parentId) || !incoming.has(folder.parentId),
    );
    // Only a loop is left: its first folder goes to the top level, which frees the rest.
    const batch = ready.length > 0 ? ready : pending.slice(0, 1);
    for (const folder of batch) {
      const parentId = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
      const { rows } = await tx.query(
        `INSERT INTO folders (workspace_id, id, parent_id, name, created_at)
         VALUES ($1, $2, $3, $4, timestamptz 'epoch' + $5 * interval '1 millisecond')
         ON CONFLICT (workspace_id, id) DO NOTHING RETURNING id`,
        [workspaceId, folder.id, parentId, folder.name, folder.createdAt],
      );
      count += rows.length;
      known.add(folder.id);
    }
    const placed = new Set(batch.map((folder) => folder.id));
    pending = pending.filter((folder) => !placed.has(folder.id));
  }
  return { count, skipped };
}

async function importProjects(tx: Queryable, workspaceId: string, projects: ImportProject[]) {
  const records = projects.map((project) => ({
    id: project.id,
    folder_id: project.folderId,
    name: project.name,
    source: storedSource(project.source),
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }));
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO projects (id, workspace_id, folder_id, name, source, created_at, updated_at)
     SELECT x.id, $1, x.folder_id, x.name, x.source, ${at("created_at")}, ${at("updated_at")}
     FROM jsonb_to_recordset($2::jsonb) AS x(id text, folder_id text, name text, source jsonb,
       created_at bigint, updated_at bigint)
     WHERE EXISTS (SELECT 1 FROM folders WHERE workspace_id = $1 AND id = x.folder_id)
     ON CONFLICT (id) DO NOTHING RETURNING id`,
    [workspaceId, JSON.stringify(records)],
  );
  return new Set(rows.map((row) => row.id));
}

/** Children are only ever written under projects this import just made in this workspace. */
const IMPORTED = `JOIN projects AS project ON project.id = x.project_id
  AND project.workspace_id = $1 AND project.id = ANY($3)`;

async function importPages(
  tx: Queryable,
  workspaceId: string,
  projects: ImportProject[],
  ids: string[],
) {
  const records = projects.flatMap((project) =>
    project.source.kind === "pages"
      ? project.source.pages.map((page, position) => ({
          project_id: project.id,
          id: page.id,
          blob_key: page.blobKey,
          name: page.name,
          width: page.width ?? null,
          height: page.height ?? null,
          rev: page.rev ?? 0,
          position,
        }))
      : [],
  );
  await tx.query(
    `INSERT INTO pages (project_id, id, blob_key, name, width, height, rev, position)
     SELECT x.project_id, x.id, x.blob_key, x.name, x.width, x.height, x.rev, x.position
     FROM jsonb_to_recordset($2::jsonb) AS x(project_id text, id text, blob_key text, name text,
       width int, height int, rev int, position int)
     ${IMPORTED}`,
    [workspaceId, JSON.stringify(records), ids],
  );
}

async function importSnapshots(
  tx: Queryable,
  workspaceId: string,
  data: ImportData,
  ids: string[],
) {
  const records = data.snapshots.map((snapshot) => ({
    project_id: snapshot.projectId,
    id: snapshot.id,
    blob_key: snapshot.blobKey,
    width: snapshot.width,
    height: snapshot.height,
    scale: snapshot.scale ?? 1,
    source_url: snapshot.sourceUrl,
    created_at: snapshot.createdAt,
  }));
  return inserted(
    tx,
    `INSERT INTO snapshots (project_id, id, blob_key, width, height, scale, source_url, created_at)
     SELECT x.project_id, x.id, x.blob_key, x.width, x.height, x.scale, x.source_url,
       ${at("created_at")}
     FROM jsonb_to_recordset($2::jsonb) AS x(project_id text, id text, blob_key text,
       width int, height int, scale double precision, source_url text, created_at bigint)
     ${IMPORTED}
     ON CONFLICT (project_id, id) DO NOTHING RETURNING 1`,
    [workspaceId, JSON.stringify(records), ids],
  );
}

/**
 * Comments whose snapshot or page came in too. Comments by `authorName` (the
 * browser's own name) are the importing member's; the rest were pulled from
 * guests, so they keep no user.
 */
async function importComments(
  tx: Queryable,
  workspaceId: string,
  data: ImportData,
  surfaces: { snapshots: Set<string>; pages: Set<string> },
  userId: string,
  ids: string[],
) {
  const placed = data.comments.filter(
    (comment) =>
      (!comment.snapshotId ||
        surfaces.snapshots.has(`${comment.projectId}/${comment.snapshotId}`)) &&
      (!comment.pageId || surfaces.pages.has(`${comment.projectId}/${comment.pageId}`)),
  );
  const records = placed.map((comment) => ({
    project_id: comment.projectId,
    id: comment.id,
    x: comment.x,
    y: comment.y,
    body: comment.body,
    author_name: comment.author,
    author_user_id: comment.author === data.authorName ? userId : null,
    // A client's: pulled from a review link, or anyone's but the owner's (pulled before
    // the browser marked them). Shown the same way before and after the import.
    origin: comment.fromClient || comment.author !== data.authorName ? "client" : "team",
    status: comment.status,
    snapshot_id: comment.snapshotId ?? null,
    page_id: comment.pageId ?? null,
    crop: comment.crop ?? null,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    resolved_at: comment.resolvedAt ?? null,
  }));
  return inserted(
    tx,
    `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id, status,
       snapshot_id, page_id, crop, created_at, updated_at, resolved_at, origin)
     SELECT x.project_id, x.id, x.x, x.y, x.body, x.author_name, x.author_user_id, x.status,
       x.snapshot_id, x.page_id, x.crop, ${at("created_at")}, ${at("updated_at")},
       ${at("resolved_at")}, x.origin
     FROM jsonb_to_recordset($2::jsonb) AS x(project_id text, id text, x double precision,
       y double precision, body text, author_name text, author_user_id uuid, status text,
       snapshot_id text, page_id text, crop jsonb, created_at bigint, updated_at bigint,
       resolved_at bigint, origin text)
     ${IMPORTED}
     ON CONFLICT (project_id, id) DO NOTHING RETURNING 1`,
    [workspaceId, JSON.stringify(records), ids],
  );
}

/** Which of the workspace's projects `ids` are in the trash. */
async function trashedIds(tx: Queryable, workspaceId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const { rows } = await tx.query<{ id: string }>(
    "SELECT id FROM projects WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NOT NULL",
    [workspaceId, ids],
  );
  return new Set(rows.map((row) => row.id));
}

/**
 * Every file the workspace's live projects `ids` point at (pages, snapshots,
 * then crops, in `ids` order) that it has no row for yet.
 */
async function missingFiles(tx: Queryable, workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const { rows } = await tx.query<{ project_id: string; key: string }>(
    `SELECT file.project_id, file.key FROM (
       SELECT project_id, blob_key AS key, 0 AS kind, position AS rank, id FROM pages
       WHERE project_id = ANY($2)
       UNION ALL
       SELECT project_id, blob_key, 1, 0, id FROM snapshots WHERE project_id = ANY($2)
       UNION ALL
       SELECT project_id, crop->>'blobKey', 2, 0, id FROM comments
       WHERE project_id = ANY($2) AND crop->>'blobKey' IS NOT NULL
     ) AS file
     JOIN projects AS project ON project.id = file.project_id
       AND project.workspace_id = $1 AND project.deleted_at IS NULL
     ORDER BY file.kind, array_position($2::text[], file.project_id), file.rank, file.id`,
    [workspaceId, ids],
  );
  const { rows: stored } = await tx.query<{ key: string }>(
    "SELECT key FROM workspace_blobs WHERE workspace_id = $1 AND project_id = ANY($2)",
    [workspaceId, ids],
  );
  const have = new Set(stored.map((row) => row.key));
  const uploads: ImportResult["uploads"] = [];
  for (const { project_id: projectId, key } of rows) {
    const path = blobPath(workspaceId, projectId, key);
    if (have.has(path)) continue;
    have.add(path);
    uploads.push({ projectId, key });
  }
  return uploads;
}

/** Everything the import writes, in the caller's transaction. */
async function importInto(
  tx: Queryable,
  workspaceId: string,
  userId: string,
  data: ImportData,
  now: number,
  secret: string | undefined,
): Promise<QueryResult<ImportResult>> {
  const projects = firstOfEach(data.projects);
  if (
    await takenElsewhere(
      tx,
      workspaceId,
      projects.map((project) => project.id),
    )
  ) {
    return refuse("exists");
  }
  const imported = zero();
  const skipped = zero();
  const folders = await importFolders(tx, workspaceId, data);
  imported.folders = folders.count;
  skipped.folders = folders.skipped;

  const had = await existingIds(tx, "projects", workspaceId);
  const fresh = projects.filter((project) => !had.has(project.id));
  const ids = await importProjects(tx, workspaceId, fresh);
  const lost = fresh.filter((project) => !ids.has(project.id)).map((project) => project.id);
  // Another workspace's import got there first (its insert won the conflict): undo all of this.
  if (await takenElsewhere(tx, workspaceId, lost)) throw new TakenElsewhere();
  const made = fresh.filter((project) => ids.has(project.id));
  const madeIds = [...ids];
  imported.projects = made.length;
  skipped.projects = data.projects.length - made.length;

  await importPages(tx, workspaceId, made, madeIds);
  imported.snapshots = await importSnapshots(tx, workspaceId, data, madeIds);
  skipped.snapshots = data.snapshots.length - imported.snapshots;
  const surfaces = {
    snapshots: new Set(data.snapshots.map((snapshot) => `${snapshot.projectId}/${snapshot.id}`)),
    pages: new Set(
      made.flatMap((project) =>
        project.source.kind === "pages"
          ? project.source.pages.map((page) => `${project.id}/${page.id}`)
          : [],
      ),
    ),
  };
  imported.comments = await importComments(tx, workspaceId, data, surfaces, userId, madeIds);
  skipped.comments = data.comments.length - imported.comments;

  const unlinked: string[] = [];
  for (const project of made) {
    if (!project.share) continue;
    const { id: shareId, ...share } = project.share;
    const attached = await attachShare(
      tx,
      workspaceId,
      project.id,
      { shareId, ...share, invitedBy: userId },
      now,
      secret,
    );
    if (attached.ok) imported.shares += 1;
    else {
      skipped.shares += 1;
      unlinked.push(project.id);
    }
  }
  skipped.shares += projects.filter((project) => project.share && !ids.has(project.id)).length;

  const earlier = projects.filter((project) => had.has(project.id)).map((project) => project.id);
  const binned = await trashedIds(tx, workspaceId, earlier);
  const existing = earlier.filter((id) => !binned.has(id));
  const live = projects
    .map((project) => project.id)
    .filter((id) => ids.has(id) || existing.includes(id));
  return done({
    imported,
    skipped,
    projects: {
      imported: made.map((project) => project.id),
      existing,
      trashed: earlier.filter((id) => binned.has(id)),
      unlinked,
    },
    uploads: await missingFiles(tx, workspaceId, live),
  });
}

export async function importData(
  db: Database,
  workspaceId: string,
  userId: string,
  data: ImportData,
  now: number,
  secret?: string,
): Promise<QueryResult<ImportResult>> {
  try {
    return await db.transaction((tx) => importInto(tx, workspaceId, userId, data, now, secret));
  } catch (error) {
    // Another import took one of these ids between the checks and the inserts.
    const code = (error as { code?: unknown } | null)?.code;
    if (error instanceof TakenElsewhere || code === UNIQUE_VIOLATION) return refuse("exists");
    throw error;
  }
}
