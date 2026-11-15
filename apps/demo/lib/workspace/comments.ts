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
  /** The author's name as it is now (`users.name`) on a team comment, else as posted. */
  author_name: string;
  /** Server-side only: compared with the session's user for `mine`, never sent. */
  author_user_id: string | null;
  status: Comment["status"];
  snapshot_id: string | null;
  page_id: string | null;
  crop: CommentCrop | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  edited_at: Date | null;
  /** Its `origin` is 'client': a guest's comment, pulled from the review link. */
  from_client: boolean;
}

/**
 * A team comment shows its author's name as it is now, so a rename shows
 * everywhere; the name it was posted under stands in once the account has
 * none (not given yet, or scrubbed when it was deleted for good).
 */
const columns = (alias: string) => `${alias}.project_id, ${alias}.id, ${alias}.x, ${alias}.y,
  ${alias}.body,
  CASE WHEN ${alias}.origin = 'team'
    THEN COALESCE((SELECT u.name FROM users AS u WHERE u.id = ${alias}.author_user_id),
      ${alias}.author_name)
    ELSE ${alias}.author_name END AS author_name,
  ${alias}.author_user_id, ${alias}.status, ${alias}.snapshot_id, ${alias}.page_id, ${alias}.crop,
  ${alias}.created_at, ${alias}.updated_at, ${alias}.resolved_at, ${alias}.edited_at,
  ${alias}.origin = 'client' AS from_client`;
const COLUMNS = columns("comment");
const RETURNING = columns("comments");

/**
 * Whose comment a change may touch beyond its status (decision 6): its text
 * and crop are its author's alone, the owner's included. A client's comment
 * has no author account, so it's nobody's.
 */
const OWN = "comment.origin = 'team' AND comment.author_user_id";

/** Who changes a comment: the session's user, and whether they may delete anyone's (`comment.moderate`). */
export interface CommentActor {
  userId: string;
  canModerate: boolean;
}

/**
 * Never the author's user id: the wire format is the browser store's. Only
 * where the comment came from shows, as `fromClient` (a client's comment),
 * and, for `viewerId`, whether it's theirs (`mine`).
 */
function toComment(row: CommentRow, viewerId?: string): Comment {
  const mine = !row.from_client && viewerId !== undefined && row.author_user_id === viewerId;
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
    ...(row.edited_at ? { editedAt: toMs(row.edited_at) } : {}),
    ...(row.snapshot_id ? { snapshotId: row.snapshot_id } : {}),
    ...(row.page_id ? { pageId: row.page_id } : {}),
    ...(row.crop ? { crop: row.crop } : {}),
    ...(row.from_client ? { fromClient: true as const } : {}),
    ...(mine ? { mine: true as const } : {}),
  };
}

/**
 * The comments of the workspace's live projects (or of one), oldest first;
 * those `viewerId` wrote are `mine`.
 */
export async function listComments(
  db: Queryable,
  workspaceId: string,
  projectId?: string,
  viewerId?: string,
): Promise<Comment[]> {
  const { rows } = await db.query<CommentRow>(
    `SELECT ${COLUMNS} FROM comments AS comment
     JOIN projects AS project ON project.id = comment.project_id
     WHERE project.workspace_id = $1 AND project.deleted_at IS NULL
       AND ($2::text IS NULL OR project.id = $2)
     ORDER BY comment.created_at, comment.id`,
    [workspaceId, projectId ?? null],
  );
  return rows.map((row) => toComment(row, viewerId));
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
 * When a restored comment's words last changed: what the browser says, kept
 * between its creation and now, so the worst a made-up value can do is mark
 * the caller's own comment edited.
 */
function clampEditedAt(editedAt: number | undefined, createdAt: number, now: number) {
  return editedAt === undefined ? null : Math.min(Math.max(editedAt, createdAt), now);
}

/**
 * Adds a comment to a live project of the workspace; never replaces one.
 * `authorUserId` is the signed-in member (null only for guests, who post
 * through their share), and sets the comment's origin for good: 'team' with
 * one, 'client' without. A team comment is posted under the member's own
 * name (`users.name`; the body's `author` only while they have none) and,
 * when it's one of theirs brought back by Undo, keeps `editedAt`
 * (`clampEditedAt`). A guest's never takes it from the browser. Run the
 * project check first for a 404.
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
  const editedAt = authorUserId ? clampEditedAt(input.editedAt, createdAt, now) : null;
  const { rows } = await db.query<CommentRow>(
    `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id, status,
       snapshot_id, page_id, crop, created_at, updated_at, resolved_at, edited_at, origin)
     SELECT project.id, $3, $4, $5, $6,
       COALESCE((SELECT name FROM users WHERE id = $8::uuid), $7), $8, $9, $10, $11,
       $12::jsonb, $13, $14, $15, $16,
       CASE WHEN $8::uuid IS NULL THEN 'client' ELSE 'team' END
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
      editedAt === null ? null : toDate(editedAt),
    ],
  );
  return rows[0] ? done(toComment(rows[0], authorUserId ?? undefined)) : refuse("exists");
}

/**
 * Edits a comment's text, resolves or reopens it, or adds its crop. Any member
 * resolves and reopens; only the author changes the text or crop, so a patch
 * with either matches only `actor`'s own comment. Null when there's no such
 * comment, or one the patch may not change: the same answer, so nothing about
 * the comment shows. Different text marks it edited (`edited_at`); the same
 * text, a status or a crop never does.
 */
export async function updateComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  id: string,
  patch: CommentPatch,
  now: number,
  actor: Pick<CommentActor, "userId">,
): Promise<Comment | null> {
  const { rows } = await db.query<CommentRow>(
    `UPDATE comments AS comment SET
       body = COALESCE($4, comment.body),
       edited_at = CASE WHEN $4 <> comment.body THEN $7 ELSE comment.edited_at END,
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
       AND (($4::text IS NULL AND $6::jsonb IS NULL) OR (${OWN} = $8::uuid))
     RETURNING ${COLUMNS}`,
    [
      workspaceId,
      projectId,
      id,
      patch.body ?? null,
      patch.status ?? null,
      patch.crop ? JSON.stringify(patch.crop) : null,
      toDate(now),
      actor.userId,
    ],
  );
  return rows[0] ? toComment(rows[0], actor.userId) : null;
}

/**
 * Deletes `actor`'s own comment, or, for someone who may moderate (the
 * owner), anyone's, a client's included. False when there's no such comment
 * or it isn't theirs to delete.
 */
export async function deleteComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  id: string,
  actor: CommentActor,
): Promise<boolean> {
  const { rows } = await db.query(
    `DELETE FROM comments AS comment USING projects AS project
     WHERE project.id = comment.project_id AND project.workspace_id = $1
       AND project.deleted_at IS NULL AND comment.project_id = $2 AND comment.id = $3
       AND ($5::boolean OR (${OWN} = $4::uuid))
     RETURNING comment.id`,
    [workspaceId, projectId, id, actor.userId, actor.canModerate],
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
