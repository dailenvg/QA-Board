import { audit } from "../account/audit";
import { type ClientInfo, parseClientInfo } from "../client-info/schema";
import { hashPassword } from "../auth/password";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { shareServices } from "../share/server";
import type { BlobLocation } from "../share/types";
import { isExpired } from "../share/retention";
import { reviewDeadline, windowHours } from "../share/review-window";
import { secretMatches } from "../share/tokens";
import { openSecret, sealSecret } from "./sealed-secrets";
import type { ShareAttach, ShareSettings, ShareSync } from "./schemas";
import { toDate, toMs, toMsOrNull } from "./times";
import { done, refuse, type QueryResult } from "./query-result";
import type {
  OwnerShareLink,
  ReviewWindowState,
  SharePasswordState,
  ShareSettingsState,
} from "./types";

/**
 * A workspace project's review link (023). Its token and owner key are sealed
 * at rest (`sealed-secrets.ts`), each bound to its workspace, project and
 * field, and only opened for a member of that workspace.
 */

/** What a link's secret is sealed to: its workspace, project and field. */
export const linkSecretContext = (
  workspaceId: string,
  projectId: string,
  field: "token" | "owner-key",
) => `share-link:${workspaceId}:${projectId}:${field}`;
const context = linkSecretContext;

interface LinkRow {
  share_id: string;
  token_sealed: string;
  owner_key_sealed: string;
  cursor: string | number;
  last_synced_at: Date | null;
  share_created_at: string | number;
  review_window_hours: number | null;
  password_set_at: Date | null;
}

/** A link's review window as the API sends it, counted from the share's creation. */
export function reviewWindowState(createdAt: number, hours: number | null): ReviewWindowState {
  return { reviewWindowHours: hours, reviewEndsAt: reviewDeadline(createdAt, hours) };
}

/** Whether a link has a password, from when it was set (null without one). */
export function passwordState(setAt: Date | null): SharePasswordState {
  return { hasPassword: setAt !== null, passwordSetAt: toMsOrNull(setAt) };
}

/** A live project's link with its secrets, or null when it has none. */
export async function getShareLink(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  secret?: string,
): Promise<OwnerShareLink | null> {
  const { rows } = await db.query<LinkRow>(
    `SELECT link.share_id, link.token_sealed, link.owner_key_sealed, link.cursor,
       link.last_synced_at, share.created_at AS share_created_at, share.review_window_hours,
       share.password_set_at
     FROM project_share_links AS link
     JOIN projects AS project
       ON project.workspace_id = link.workspace_id AND project.id = link.project_id
     JOIN squint_shares AS share ON share.id = link.share_id
     WHERE link.workspace_id = $1 AND link.project_id = $2 AND project.deleted_at IS NULL`,
    [workspaceId, projectId],
  );
  const row = rows[0];
  if (!row) return null;
  const createdAt = Number(row.share_created_at);
  return {
    id: row.share_id,
    token: openSecret(row.token_sealed, context(workspaceId, projectId, "token"), secret),
    ownerKey: openSecret(
      row.owner_key_sealed,
      context(workspaceId, projectId, "owner-key"),
      secret,
    ),
    createdAt,
    cursor: Number(row.cursor),
    ...(row.last_synced_at ? { lastSyncedAt: toMs(row.last_synced_at) } : {}),
    ...reviewWindowState(createdAt, row.review_window_hours),
    ...passwordState(row.password_set_at),
  };
}

interface ShareRow {
  token_hash: string;
  owner_key_hash: string;
  workspace_id: string | null;
  project_id: string | null;
  expires_at: string | number | null;
}

/** The share, if `input` holds its token and owner key and it hasn't expired. */
async function provenShare(tx: Queryable, input: ShareAttach, now: number) {
  const { rows } = await tx.query<ShareRow>(
    `SELECT token_hash, owner_key_hash, workspace_id, project_id, expires_at
     FROM squint_shares WHERE id = $1 FOR UPDATE`,
    [input.shareId],
  );
  const row = rows[0];
  if (!row) return null;
  const expiresAt = row.expires_at === null ? null : Number(row.expires_at);
  const proven =
    secretMatches(input.ownerKey, row.owner_key_hash) &&
    secretMatches(input.token, row.token_hash) &&
    !isExpired(expiresAt, now);
  return proven ? row : null;
}

/** What attaching takes besides the proof: the pull position, and who's attaching it. */
interface AttachExtras {
  cursor?: number;
  lastSyncedAt?: number;
  /**
   * The member attaching it, recorded as who invited the link's reviewers.
   * The first one stays: attaching again (a retry, an import) never changes it.
   */
  invitedBy?: string;
}

/**
 * Makes a share the review link of a live project of the workspace. The
 * caller proves it owns the share with its owner key (checked against
 * `owner_key_hash`) and token; a share made without signing in then joins the
 * workspace and stops deleting itself after 30 days. With a `reviewWindow`
 * the link takes it; without one it keeps the window it has. A share already
 * in another workspace, or on another project, answers like an unknown one.
 * Run inside a transaction.
 */
export async function attachShare(
  tx: Queryable,
  workspaceId: string,
  projectId: string,
  input: ShareAttach & AttachExtras,
  now: number,
  secret?: string,
): Promise<QueryResult<null>> {
  const { rows: project } = await tx.query(
    `SELECT 1 FROM projects WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [workspaceId, projectId],
  );
  if (project.length === 0) return refuse("not-found");
  const share = await provenShare(tx, input, now);
  if (!share) return refuse("not-found");
  const elsewhere =
    share.workspace_id !== null &&
    (share.workspace_id !== workspaceId || share.project_id !== projectId);
  if (elsewhere) return refuse("not-found");
  const { rows: linked } = await tx.query<{ share_id: string }>(
    "SELECT share_id FROM project_share_links WHERE workspace_id = $1 AND project_id = $2",
    [workspaceId, projectId],
  );
  if (linked[0] && linked[0].share_id !== input.shareId) return refuse("linked");
  await tx.query(
    `UPDATE squint_shares SET workspace_id = $2, project_id = $3, expires_at = NULL,
       invited_by_user_id = COALESCE(invited_by_user_id, $4::uuid),
       review_window_hours = CASE WHEN $5::boolean THEN $6::integer ELSE review_window_hours END
     WHERE id = $1`,
    [
      input.shareId,
      workspaceId,
      projectId,
      input.invitedBy ?? null,
      input.reviewWindow !== undefined,
      input.reviewWindow === undefined ? null : windowHours(input.reviewWindow),
    ],
  );
  await tx.query(
    `INSERT INTO project_share_links
       (workspace_id, project_id, share_id, token_sealed, owner_key_sealed, cursor, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workspace_id, project_id) DO UPDATE SET token_sealed = EXCLUDED.token_sealed,
       owner_key_sealed = EXCLUDED.owner_key_sealed,
       cursor = GREATEST(project_share_links.cursor, EXCLUDED.cursor)`,
    [
      workspaceId,
      projectId,
      input.shareId,
      sealSecret(input.token, context(workspaceId, projectId, "token"), secret),
      sealSecret(input.ownerKey, context(workspaceId, projectId, "owner-key"), secret),
      input.cursor ?? 0,
      input.lastSyncedAt === undefined ? null : toDate(input.lastSyncedAt),
    ],
  );
  return done(null);
}

/** Records the owner's pull position; the cursor never moves back. False without a link. */
export async function syncShareLink(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  sync: ShareSync,
): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE project_share_links AS link
     SET cursor = GREATEST(link.cursor, $3), last_synced_at = $4
     FROM projects AS project
     WHERE project.workspace_id = link.workspace_id AND project.id = link.project_id
       AND project.deleted_at IS NULL AND link.workspace_id = $1 AND link.project_id = $2
     RETURNING link.share_id`,
    [workspaceId, projectId, sync.cursor, toDate(sync.lastSyncedAt)],
  );
  return rows.length === 1;
}

/**
 * Changes a live project's review link settings, either or both: how long
 * its clients can comment (still counted from the link's creation), and who
 * it's for (`clientName`, cleaned; null clears it). Records who changed what:
 * the fields, and the new window, never the client's name. Shortened past the
 * time already gone, the review closes at once; lengthened, a closed review
 * opens again. Only a workspace's link has these settings. Null without a link.
 */
export async function changeShareSettings(
  db: Database,
  actor: { userId: string; workspaceId: string },
  projectId: string,
  settings: ShareSettings,
  now: number,
): Promise<ShareSettingsState | null> {
  const { workspaceId } = actor;
  const { reviewWindow, clientName } = settings;
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{
      created_at: string | number;
      review_window_hours: number | null;
      client_name: string | null;
    }>(
      `UPDATE squint_shares AS share SET
         review_window_hours = CASE WHEN $3::boolean THEN $4::integer ELSE share.review_window_hours END,
         client_name = CASE WHEN $5::boolean THEN $6::text ELSE share.client_name END
       FROM project_share_links AS link
       JOIN projects AS project
         ON project.workspace_id = link.workspace_id AND project.id = link.project_id
       WHERE share.id = link.share_id AND link.workspace_id = $1 AND link.project_id = $2
         AND project.deleted_at IS NULL
       RETURNING share.created_at, share.review_window_hours, share.client_name`,
      [
        workspaceId,
        projectId,
        reviewWindow !== undefined,
        reviewWindow === undefined ? null : windowHours(reviewWindow),
        clientName !== undefined,
        clientName ?? null,
      ],
    );
    const row = rows[0];
    if (!row) return null;
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId,
        action: "share.settings_changed",
        target: { type: "project", id: projectId },
        fields: [
          ...(reviewWindow === undefined ? [] : ["reviewWindow"]),
          ...(clientName === undefined ? [] : ["clientName"]),
        ],
        ...(reviewWindow === undefined ? {} : { meta: { reviewWindow } }),
      },
      now,
    );
    return {
      ...reviewWindowState(Number(row.created_at), row.review_window_hours),
      clientName: row.client_name,
    };
  });
}

/**
 * Sets, changes or (with null) removes the password guests of a live
 * project's review link must enter, and records who did it (never the
 * password or its hash). Any new password, even the same one again, voids
 * every guest pass issued before it (`guest-pass.ts`), as removing it does.
 * Only a workspace's link has one. Null without a link.
 */
export async function changeSharePassword(
  db: Database,
  actor: { userId: string; workspaceId: string },
  projectId: string,
  password: string | null,
  now: number,
): Promise<SharePasswordState | null> {
  const { workspaceId } = actor;
  // Hashed before the transaction: Argon2 takes a while and needs no lock.
  const hash = password === null ? null : await hashPassword(password);
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ password_set_at: Date | null }>(
      `UPDATE squint_shares AS share SET password_hash = $3, password_set_at = $4
       FROM project_share_links AS link
       JOIN projects AS project
         ON project.workspace_id = link.workspace_id AND project.id = link.project_id
       WHERE share.id = link.share_id AND link.workspace_id = $1 AND link.project_id = $2
         AND project.deleted_at IS NULL
       RETURNING share.password_set_at`,
      [workspaceId, projectId, hash, hash === null ? null : toDate(now)],
    );
    const row = rows[0];
    if (!row) return null;
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId,
        action: hash === null ? "share.password_removed" : "share.password_set",
        target: { type: "project", id: projectId },
        fields: ["password"],
      },
      now,
    );
    return passwordState(row.password_set_at);
  });
}

/** The ids of every share of a project of the workspace (linked or not), to revoke them. */
export async function projectShareIds(
  db: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM squint_shares WHERE workspace_id = $1 AND project_id = $2",
    [workspaceId, projectId],
  );
  return rows.map((row) => row.id);
}

/**
 * What a guest's comment says on the project's review link: the link is the
 * authority for a client's words (4.12), so the workspace copies these from
 * here, never from the browser. `editedAt` is when the guest last changed
 * the words there (epoch ms), or null.
 */
export interface GuestComment {
  body: string;
  author: string;
  x: number;
  y: number;
  /** When the guest posted it (epoch ms), as the server stamped it there. */
  createdAt: number;
  editedAt: number | null;
  /** The browser they posted from, as the link recorded it; null when it didn't (before 052). */
  clientInfo: ClientInfo | null;
}

interface GuestCommentRow {
  data: Partial<Record<keyof GuestComment, unknown>>;
  client_info: unknown;
}

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
};

/**
 * The guest's comment `commentId` on the review link of the workspace's
 * project, as the link holds it: the only comments a member may save as a
 * guest's (without an author account), so nobody can pass their own, or
 * another member's, off as one. Null when a guest didn't post it there (or
 * it's still being posted).
 */
export async function findGuestComment(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  commentId: string,
): Promise<GuestComment | null> {
  const { rows } = await db.query<GuestCommentRow>(
    `SELECT comment.data, comment.client_info FROM project_share_links AS link
     JOIN squint_share_comments AS comment ON comment.share_id = link.share_id
     WHERE link.workspace_id = $1 AND link.project_id = $2
       AND comment.id = $3 AND comment.origin = 'client' AND NOT comment.pending`,
    [workspaceId, projectId, commentId],
  );
  const [row] = rows;
  const data = row?.data;
  const [x, y, createdAt] = [finite(data?.x), finite(data?.y), finite(data?.createdAt)];
  if (!data || typeof data.body !== "string" || typeof data.author !== "string") return null;
  if (x === null || y === null || createdAt === null) return null;
  const { body, author } = data;
  const clientInfo = parseClientInfo(row?.client_info);
  return { body, author, x, y, createdAt, editedAt: finite(data.editedAt), clientInfo };
}

/**
 * What a guest's reply says on the project's review link: as for comments,
 * the workspace copies a client's words from here, never from the browser.
 */
export interface GuestReply {
  body: string;
  author: string;
  /** When the guest posted it (epoch ms), as the server stamped it there. */
  createdAt: number;
  /** The browser they posted from, as the link recorded it; null when it didn't. */
  clientInfo: ClientInfo | null;
}

/**
 * The guest's reply `replyId` to comment `commentId` on the review link of
 * the workspace's project, as the link holds it: the only replies a member
 * may save as a guest's, as `findGuestComment` for comments. Null when a
 * guest didn't post it there, under that comment.
 */
export async function findGuestReply(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  commentId: string,
  replyId: string,
): Promise<GuestReply | null> {
  const { rows } = await db.query<GuestCommentRow>(
    `SELECT reply.data, reply.client_info FROM project_share_links AS link
     JOIN squint_share_replies AS reply ON reply.share_id = link.share_id
     WHERE link.workspace_id = $1 AND link.project_id = $2
       AND reply.comment_id = $3 AND reply.id = $4 AND reply.origin = 'client'`,
    [workspaceId, projectId, commentId, replyId],
  );
  const [row] = rows;
  const data = row?.data;
  const createdAt = finite(data?.createdAt);
  if (!data || typeof data.body !== "string" || typeof data.author !== "string") return null;
  if (createdAt === null) return null;
  const { body, author } = data;
  return { body, author, createdAt, clientInfo: parseClientInfo(row?.client_info) };
}

/**
 * Discards the files of blob rows a committed change took off a review link
 * (a comment gone team only: its crop). Best effort, as every discard.
 */
export async function discardLinkFiles(locations: readonly BlobLocation[]): Promise<void> {
  if (locations.length === 0) return;
  const { blobs } = await shareServices();
  await blobs.discard(locations);
}

/** The id of the share linked to the workspace's live project, or null without one. */
export async function linkedShareId(
  db: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ share_id: string }>(
    `SELECT link.share_id FROM project_share_links AS link
     JOIN projects AS project
       ON project.workspace_id = link.workspace_id AND project.id = link.project_id
     WHERE link.workspace_id = $1 AND link.project_id = $2 AND project.deleted_at IS NULL`,
    [workspaceId, projectId],
  );
  return rows[0]?.share_id ?? null;
}
