import type { Queryable } from "../share/migrate";
import type { Comment, CommentCrop } from "../store/types";
import type { CommentCreate, CommentPatch } from "./schemas";
import { toDate, toMs } from "./times";
import { done, refuse, type QueryResult } from "./query-result";

/** Comments are reached through their project, so only the workspace's live projects' are. */

interface CommentRow {
  project_id: string;
  id: string;
  x: number;
  y: number;
  body: string;
  author_name: string;
  status: Comment["status"];
  snapshot_id: string | null;
  page_id: string | null;
  crop: CommentCrop | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

const COLUMNS = `comment.project_id, comment.id, comment.x, comment.y, comment.body,
  comment.author_name, comment.status, comment.snapshot_id, comment.page_id, comment.crop,
  comment.created_at, comment.updated_at, comment.resolved_at`;
const RETURNING = COLUMNS.replaceAll("comment.", "");

/** Never the author's user id: the wire format is the browser store's. */
function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    projectId: row.project_id,
    x: row.x,
    y: row.y,
    body: row.body,
    author: row.author_name,
    status: row.status,
    createdAt: toMs(row.created_at),
    updatedAt: toMs(row.updated_at),
    ...(row.resolved_at ? { resolvedAt: toMs(row.resolved_at) } : {}),
    ...(row.snapshot_id ? { snapshotId: row.snapshot_id } : {}),
    ...(row.page_id ? { pageId: row.page_id } : {}),
    ...(row.crop ? { crop: row.crop } : {}),
  };
}

/** The comments of the workspace's live projects (or of one), oldest first. */
export async function listComments(
  db: Queryable,
  workspaceId: string,
  projectId?: string,
): Promise<Comment[]> {
  const { rows } = await db.query<CommentRow>(
    `SELECT ${COLUMNS} FROM comments AS comment
     JOIN projects AS project ON project.id = comment.project_id
     WHERE project.workspace_id = $1 AND project.deleted_at IS NULL
       AND ($2::text IS NULL OR project.id = $2)
     ORDER BY comment.created_at, comment.id`,
    [workspaceId, projectId ?? null],
  );
  return rows.map(toComment);
}

/** Whether the comment's snapshot or page (when it names one) belongs to the project. */
async function surfaceExists(db: Queryable, projectId: string, input: CommentCreate) {
  const { rows } = await db.query<{ ok: boolean }>(
    `SELECT ($2::text IS NULL OR EXISTS (
         SELECT 1 FROM snapshots WHERE project_id = $1 AND id = $2))
       AND ($3::text IS NULL OR EXISTS (
         SELECT 1 FROM pages WHERE project_id = $1 AND id = $3)) AS ok`,
    [projectId, input.snapshotId ?? null, input.pageId ?? null],
  );
  return rows[0]?.ok === true;
}

/**
 * Adds a comment to a live project of the workspace; never replaces one.
 * `authorUserId` is the signed-in member (null only for guests, who post
 * through their share). Run the project check first for a 404.
 */
export async function addComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  input: CommentCreate,
  authorUserId: string | null,
  now: number,
): Promise<QueryResult<Comment>> {
  if (!(await surfaceExists(db, projectId, input))) return refuse("unknown-surface");
  const createdAt = input.createdAt ?? now;
  const resolvedAt = input.status === "resolved" ? (input.resolvedAt ?? now) : null;
  const { rows } = await db.query<CommentRow>(
    `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id, status,
       snapshot_id, page_id, crop, created_at, updated_at, resolved_at)
     SELECT project.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15
     FROM projects AS project
     WHERE project.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
     ON CONFLICT (project_id, id) DO NOTHING RETURNING ${RETURNING}`,
    [
      workspaceId,
      projectId,
      input.id,
      input.x,
      input.y,
      input.body,
      input.author,
      authorUserId,
      input.status,
      input.snapshotId ?? null,
      input.pageId ?? null,
      input.crop ? JSON.stringify(input.crop) : null,
      toDate(createdAt),
      toDate(input.updatedAt ?? createdAt),
      resolvedAt === null ? null : toDate(resolvedAt),
    ],
  );
  return rows[0] ? done(toComment(rows[0])) : refuse("exists");
}

/** Edits a comment's text, resolves or reopens it, or adds its crop. Null when there's no such comment. */
export async function updateComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  id: string,
  patch: CommentPatch,
  now: number,
): Promise<Comment | null> {
  const { rows } = await db.query<CommentRow>(
    `UPDATE comments AS comment SET
       body = COALESCE($4, comment.body),
       status = COALESCE($5, comment.status),
       resolved_at = CASE
         WHEN $5::text IS NULL THEN comment.resolved_at
         WHEN $5 = 'resolved' THEN COALESCE(comment.resolved_at, $7)
       END,
       crop = COALESCE($6::jsonb, comment.crop),
       updated_at = $7
     FROM projects AS project
     WHERE project.id = comment.project_id AND project.workspace_id = $1
       AND project.deleted_at IS NULL AND comment.project_id = $2 AND comment.id = $3
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
      projectId,
      id,
      patch.body ?? null,
      patch.status ?? null,
      patch.crop ? JSON.stringify(patch.crop) : null,
      toDate(now),
    ],
  );
  return rows[0] ? toComment(rows[0]) : null;
}

export async function deleteComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  id: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `DELETE FROM comments AS comment USING projects AS project
     WHERE project.id = comment.project_id AND project.workspace_id = $1
       AND project.deleted_at IS NULL AND comment.project_id = $2 AND comment.id = $3
     RETURNING comment.id`,
    [workspaceId, projectId, id],
  );
  return rows.length === 1;
}

/**
 * Puts the comments of a project that sit on no surface (a website's live
 * frame, from before snapshots) on page `pageId`, as the browser does when a
 * screenshot replaces the website (`placeComment`). Their position stays.
 * Run inside the source change's transaction, once the project is checked.
 */
export async function placeFrameComments(
  tx: Queryable,
  projectId: string,
  pageId: string,
): Promise<void> {
  await tx.query(
    `UPDATE comments SET page_id = $2
     WHERE project_id = $1 AND snapshot_id IS NULL AND page_id IS NULL`,
    [projectId, pageId],
  );
}
