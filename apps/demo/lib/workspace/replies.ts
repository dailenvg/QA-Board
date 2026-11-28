import type { ClientInfo } from "../client-info/schema";
import type { Database } from "../db/database";
import { personAvatarSrc } from "../routes";
import { logoVersion } from "../share/brand";
import type { Queryable } from "../share/migrate";
import { lockShare } from "../share/share-lock";
import type { Reply } from "../store/types";
import { clampEditedAt, MAY_SHARE, takeOffLink, type CommentActor } from "./comments";
import { personKey } from "./members/person-key";
import { done, refuse, type QueryResult } from "./query-result";
import type { ReplyCreate, ReplyPatch } from "./schemas";
import { linkedShareId, type GuestReply } from "./share-links";
import { toDate, toMs } from "./times";

/**
 * Replies in comments' threads (053). Like comments, they're reached through
 * their project, so only the workspace's live projects' are; a reply never
 * reopens its comment, and the team replies to resolved comments too.
 */

interface ReplyRow {
  project_id: string;
  comment_id: string;
  id: string;
  body: string;
  /** The author's name as it is now (`users.name`) on a team reply, else as posted. */
  author_name: string;
  /** Server-side only: compared with the session's user for `mine`, never sent. */
  author_user_id: string | null;
  created_at: Date;
  edited_at: Date | null;
  client_info: ClientInfo | null;
  /** Its `origin` is 'client': a guest's reply, from the review link. */
  from_client: boolean;
  /** Kept off review links (057); a reply under a team-only comment is kept off anyway. */
  team_only: boolean;
  /** A team reply's author's avatar key while they're an active member with a photo. Server-side only. */
  author_avatar_key: string | null;
}

/**
 * Replies with what each shows, read with joins rather than a lookup per row
 * (`listReplies` reads every reply of the workspace at once): the author's
 * name as it is now on a team reply (the one posted under standing in once
 * the account has none), and their photo while they're an active member of
 * the reply's workspace, only where their avatar goes (as `comments.ts`).
 */
const SELECT = (source: string) => `SELECT reply.project_id, reply.comment_id, reply.id,
    reply.body, COALESCE(author.name, reply.author_name) AS author_name, reply.author_user_id,
    reply.created_at, reply.edited_at, reply.client_info, reply.origin = 'client' AS from_client,
    reply.team_only, avatar.key AS author_avatar_key
  FROM ${source} AS reply
  JOIN projects AS project ON project.id = reply.project_id
  LEFT JOIN users AS author ON reply.origin = 'team' AND author.id = reply.author_user_id
  LEFT JOIN memberships AS member ON author.deleted_at IS NULL
    AND member.user_id = author.id AND member.workspace_id = project.workspace_id
  LEFT JOIN user_blobs AS avatar ON avatar.user_id = member.user_id
    AND avatar.key = author.avatar_blob_key
    AND starts_with(avatar.key, 'user/' || author.id::text || '/avatar/')`;

/** Whose reply a change of words may touch (decision 6): its author's alone. A client's is nobody's. */
const OWN = "reply.origin = 'team' AND reply.author_user_id";

/**
 * Who posts a reply: the signed-in member, whose session makes it theirs for
 * good ('team'), or a guest ('client'), whose reply a member brings in from
 * the review link as the link's own row has it (`findGuestReply`), never as
 * the browser sends it.
 */
export type ReplyAuthor = { kind: "team"; userId: string } | { kind: "client"; guest: GuestReply };

/**
 * What goes in the row: a team reply as sent; a guest's with its words,
 * name, time and browser details from the review link, never edited.
 */
function postedAs(input: ReplyCreate, author: ReplyAuthor): ReplyCreate {
  if (author.kind === "team") return input;
  const { guest } = author;
  const { editedAt: _never, clientInfo: _sent, ...rest } = input;
  return {
    ...rest,
    body: guest.body,
    author: guest.author,
    createdAt: guest.createdAt,
    ...(guest.clientInfo ? { clientInfo: guest.clientInfo } : {}),
  };
}

/** A team author's photo URL from a reply row, or null without one. */
type AvatarOf = (row: ReplyRow) => string | null;

/**
 * Photo URLs for one read in `workspaceId`, each author's worked out once:
 * their person key is an HMAC, and a workspace's replies are many and by few people.
 */
function avatarSources(workspaceId: string): AvatarOf {
  const known = new Map<string, string>();
  return (row) => {
    if (!row.author_avatar_key || !row.author_user_id) return null;
    const cacheKey = `${row.author_user_id}/${row.author_avatar_key}`;
    const cached = known.get(cacheKey);
    if (cached) return cached;
    const src = personAvatarSrc(
      workspaceId,
      personKey(workspaceId, row.author_user_id),
      logoVersion(row.author_avatar_key),
    );
    known.set(cacheKey, src);
    return src;
  };
}

function toReply(row: ReplyRow, avatarOf: AvatarOf, viewerId?: string): Reply {
  const mine = !row.from_client && viewerId !== undefined && row.author_user_id === viewerId;
  const authorAvatar = avatarOf(row);
  return {
    id: row.id,
    projectId: row.project_id,
    commentId: row.comment_id,
    body: row.body,
    author: row.author_name,
    createdAt: toMs(row.created_at),
    ...(row.edited_at ? { editedAt: toMs(row.edited_at) } : {}),
    ...(row.client_info ? { clientInfo: row.client_info } : {}),
    ...(row.from_client ? { fromClient: true as const } : {}),
    ...(row.team_only ? { teamOnly: true as const } : {}),
    ...(mine ? { mine: true as const } : {}),
    ...(authorAvatar ? { authorAvatar } : {}),
  };
}

/**
 * The replies on the workspace's live projects (or one's), oldest first;
 * those `viewerId` wrote are `mine`. Never anyone's user id.
 */
export async function listReplies(
  db: Queryable,
  workspaceId: string,
  projectId?: string,
  viewerId?: string,
): Promise<Reply[]> {
  const { rows } = await db.query<ReplyRow>(
    `${SELECT("comment_replies")}
     WHERE project.workspace_id = $1 AND project.deleted_at IS NULL
       AND ($2::text IS NULL OR project.id = $2)
     ORDER BY reply.created_at, reply.id`,
    [workspaceId, projectId ?? null],
  );
  const avatarOf = avatarSources(workspaceId);
  return rows.map((row) => toReply(row, avatarOf, viewerId));
}

/** Whether the live project has the comment: tells a taken id (409) from a missing comment (404). */
async function commentExists(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  commentId: string,
) {
  const { rows } = await db.query(
    `SELECT 1 FROM comments AS comment JOIN projects AS project ON project.id = comment.project_id
     WHERE project.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
       AND comment.id = $3`,
    [workspaceId, projectId, commentId],
  );
  return rows.length === 1;
}

/**
 * Adds a reply to a comment of a live project of the workspace, active or
 * resolved, and leaves the comment as it is; never replaces a reply. A team
 * reply is posted under the member's own name (`users.name`; the body's
 * `author` only while they have none) and, when it's one of theirs brought
 * back by Undo, keeps `editedAt` (clamped). `clientInfo` is kept as the
 * route recorded it. A guest's is saved without an author account, as the
 * review link holds it (`postedAs`). `not-found` without the comment,
 * `exists` for a taken id. A team reply is team only when it asks
 * (`teamOnly`), and always under a team-only comment, for good (B2): showing
 * the comment later never shows it. The comment's row is locked for the
 * insert, so a reply racing a team-only change waits and reads the comment as
 * it left it. A guest's never is, even pulled in under a comment that went
 * team only after they replied.
 */
export async function addReply(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  commentId: string,
  sent: ReplyCreate,
  author: ReplyAuthor,
  now: number,
): Promise<QueryResult<Reply>> {
  const input = postedAs(sent, author);
  const userId = author.kind === "team" ? author.userId : null;
  const createdAt = input.createdAt ?? now;
  const editedAt = clampEditedAt(input.editedAt, createdAt, now);
  const { rows } = await db.query<ReplyRow>(
    `WITH added AS (
       INSERT INTO comment_replies (project_id, comment_id, id, body, author_name, author_user_id,
         origin, client_info, created_at, edited_at, team_only)
       SELECT comment.project_id, comment.id, $4, $5,
         COALESCE((SELECT name FROM users WHERE id = $7::uuid), $6), $7::uuid, $8, $9::jsonb,
         $10, $11, $8 = 'team' AND (comment.team_only OR $12::boolean)
       FROM comments AS comment JOIN projects AS project ON project.id = comment.project_id
       WHERE project.workspace_id = $1 AND project.id = $2 AND project.deleted_at IS NULL
         AND comment.id = $3
       -- Waits for a team-only change to the comment under way, then reads it as that left it,
       -- so a reply written as it's hidden can't be stored as one clients see.
       FOR SHARE OF comment
       ON CONFLICT (project_id, id) DO NOTHING RETURNING *)
     ${SELECT("added")}`,
    [
      workspaceId,
      projectId,
      commentId,
      input.id,
      input.body,
      input.author,
      userId,
      author.kind,
      input.clientInfo ? JSON.stringify(input.clientInfo) : null,
      toDate(createdAt),
      editedAt === null ? null : toDate(editedAt),
      author.kind === "team" && sent.teamOnly === true,
    ],
  );
  if (rows[0]) return done(toReply(rows[0], avatarSources(workspaceId), userId ?? undefined));
  return refuse(
    (await commentExists(db, workspaceId, projectId, commentId)) ? "exists" : "not-found",
  );
}

/**
 * Changes the words of `actor`'s own reply; nobody else's, the owner's
 * included, and never a client's. Different words mark it edited
 * (`edited_at`); the same words leave it as it was. Null when there's no such
 * reply or it isn't theirs: the same answer, so nothing about it shows.
 */
export async function updateReply(
  db: Queryable,
  workspaceId: string,
  target: { projectId: string; commentId: string; id: string },
  patch: Required<Pick<ReplyPatch, "body">>,
  now: number,
  actor: Pick<CommentActor, "userId">,
): Promise<Reply | null> {
  const { rows } = await db.query<ReplyRow>(
    `WITH changed AS (
       UPDATE comment_replies AS reply SET body = $5,
         edited_at = CASE WHEN $5 <> reply.body THEN $6 ELSE reply.edited_at END
       FROM projects AS project
       WHERE project.id = reply.project_id AND project.workspace_id = $1
         AND project.deleted_at IS NULL AND reply.project_id = $2 AND reply.comment_id = $3
         AND reply.id = $4 AND ${OWN} = $7::uuid
       RETURNING reply.*)
     ${SELECT("changed")}`,
    [
      workspaceId,
      target.projectId,
      target.commentId,
      target.id,
      patch.body,
      toDate(now),
      actor.userId,
    ],
  );
  return rows[0] ? toReply(rows[0], avatarSources(workspaceId), actor.userId) : null;
}

/**
 * Makes a team reply team only, or shows it to clients again (D9): its
 * author or the owner, both ways, under a comment clients see (a team-only
 * comment's replies are kept off anyway). `not-found` (a 404) for anything
 * else, as for a reply that isn't there. Never an edit: `edited_at` stays.
 * Making it team only takes its row off the project's review link in the
 * same transaction, under the share's lock (D41); showing it only clears the
 * flag, and the next push puts it on the link.
 */
export async function setReplyTeamOnly(
  db: Database,
  workspaceId: string,
  target: { projectId: string; commentId: string; id: string },
  teamOnly: boolean,
  actor: CommentActor,
): Promise<QueryResult<Reply>> {
  return db.transaction(async (tx) => {
    const shareId = teamOnly ? await linkedShareId(tx, workspaceId, target.projectId) : null;
    if (shareId) await lockShare(tx, shareId);
    const { rows } = await tx.query<ReplyRow>(
      `WITH changed AS (
         UPDATE comment_replies AS reply SET team_only = $6
         FROM projects AS project, comments AS parent
         WHERE project.id = reply.project_id AND project.workspace_id = $1
           AND project.deleted_at IS NULL AND reply.project_id = $2 AND reply.comment_id = $3
           AND reply.id = $7 AND parent.project_id = reply.project_id
           AND parent.id = reply.comment_id AND NOT parent.team_only AND ${MAY_SHARE("reply")}
         RETURNING reply.*)
       ${SELECT("changed")}`,
      [
        workspaceId,
        target.projectId,
        target.commentId,
        actor.userId,
        actor.canModerate,
        teamOnly,
        target.id,
      ],
    );
    if (!rows[0]) return refuse("not-found");
    if (shareId) await takeOffLink(tx, shareId, "reply", target.id);
    return done(toReply(rows[0], avatarSources(workspaceId), actor.userId));
  });
}

/**
 * Deletes `actor`'s own reply, or, for someone who may moderate (the owner),
 * anyone's, a client's included. False when there's no such reply or it
 * isn't theirs to delete.
 */
export async function deleteReply(
  db: Queryable,
  workspaceId: string,
  target: { projectId: string; commentId: string; id: string },
  actor: CommentActor,
): Promise<boolean> {
  const { rows } = await db.query(
    `DELETE FROM comment_replies AS reply USING projects AS project
     WHERE project.id = reply.project_id AND project.workspace_id = $1
       AND project.deleted_at IS NULL AND reply.project_id = $2 AND reply.comment_id = $3
       AND reply.id = $4 AND ($6::boolean OR (${OWN} = $5::uuid))
     RETURNING reply.id`,
    [workspaceId, target.projectId, target.commentId, target.id, actor.userId, actor.canModerate],
  );
  return rows.length === 1;
}
