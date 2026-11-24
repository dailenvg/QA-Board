import type { ClientInfo } from "../client-info/schema";
import { brandColor, SQUINT_BRAND } from "./brand";
import type { Queryable } from "./migrate";
import { sameShareKey, SHARE_PERSON_KEY, shareAvatarVersion, sharePersonKey } from "./share-people";
import type { ShareStore } from "./store";
import { hashesMatch } from "./tokens";
import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedReply,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
  TeamAvatar,
} from "./types";

interface ShareRow {
  id: string;
  token_hash: string;
  owner_key_hash: string;
  project: SharedProject;
  created_at: string | number;
  updated_at: string | number;
  /** Null on a workspace's share, which only goes when revoked or with its project. */
  expires_at: string | number | null;
  /** Null: no limit (035). */
  review_window_hours: number | null;
  /** Both null on an open link (036). */
  password_hash: string | null;
  password_set_at: Date | string | null;
  /** Null without a name (038). */
  client_name: string | null;
  /** Null on an anonymous share (022). */
  workspace_id: string | null;
}

interface ItemRow<T> {
  data: T;
  origin: Origin;
  seq: string | number;
  crop_key?: string | null;
  edit_seq?: string | number | null;
  client_info?: ClientInfo | null;
}

interface BlobRow {
  key: string;
  content_type: string;
  size: number;
  bytes: Uint8Array | null;
  blob_url: string | null;
}

const SHARE_COLUMNS =
  "id, token_hash, owner_key_hash, project, created_at, updated_at, expires_at, review_window_hours";

/**
 * What a read selects: a new share has no password, client name or workspace,
 * so `create` writes none of them.
 */
const READ_COLUMNS = `${SHARE_COLUMNS}, password_hash, password_set_at, client_name, workspace_id`;

/** The share's workspace project is in the trash (024) or archived (015). */
const PROJECT_CLOSED = `EXISTS (
  SELECT 1 FROM projects AS project
  WHERE project.id = squint_shares.project_id
    AND project.workspace_id = squint_shares.workspace_id
    AND (project.deleted_at IS NOT NULL OR project.archived_at IS NOT NULL)
)`;

/** The share's workspace is archived (009) or waiting to be deleted (033). */
const WORKSPACE_CLOSED = `EXISTS (
  SELECT 1 FROM workspaces AS closed
  WHERE closed.id = squint_shares.workspace_id
    AND (closed.archived_at IS NOT NULL OR closed.delete_after IS NOT NULL)
)`;

/** The share's workspace is suspended by the Squint admin (046). */
const WORKSPACE_SUSPENDED = `EXISTS (
  SELECT 1 FROM workspaces AS suspended
  WHERE suspended.id = squint_shares.workspace_id AND suspended.suspended_at IS NOT NULL
)`;

/**
 * A share answers like a revoked one while its workspace project is in the
 * trash or archived, or its workspace is archived, waiting to be deleted or
 * suspended, until that's undone. Anonymous shares have none of these. A
 * condition on `squint_shares`, for any query that must agree with the share
 * routes on which shares answer (the admin panel's count of live links).
 */
export const SHARE_ANSWERS = `NOT ${PROJECT_CLOSED} AND NOT ${WORKSPACE_CLOSED} AND NOT ${WORKSPACE_SUSPENDED}`;

/**
 * A share that would answer but for its workspace's suspension: paused, so a
 * guest is told the review isn't available right now rather than that the
 * link is gone (`pausedByTokenHash`).
 */
const SHARE_PAUSED = `NOT ${PROJECT_CLOSED} AND NOT ${WORKSPACE_CLOSED} AND ${WORKSPACE_SUSPENDED}`;

/**
 * The share's workspace and its logo row, when the logo is stored where a
 * workspace's logo goes (`ws/<workspaceId>/brand/logo/…`, no project): a key
 * pointing anywhere else, such as at a project's page, is no logo.
 */
const BRAND_FROM = `squint_shares
  JOIN workspaces AS workspace ON workspace.id = squint_shares.workspace_id
  LEFT JOIN workspace_blobs AS logo
    ON logo.workspace_id = workspace.id AND logo.key = workspace.logo_blob_key
    AND logo.project_id IS NULL
    AND starts_with(logo.key, 'ws/' || workspace.id::text || '/brand/logo/')`;

interface BrandRow {
  name: string;
  brand_color: string | null;
  logo_key: string | null;
}

/**
 * A user's avatar row, only where the user's avatar goes
 * (`user/<userId>/avatar/…`), as `lib/account/avatar.ts` reads it.
 */
const AVATAR_JOIN = (user: string) => `user_blobs AS avatar
    ON avatar.user_id = ${user}.id AND avatar.key = ${user}.avatar_blob_key
    AND starts_with(avatar.key, 'user/' || ${user}.id::text || '/avatar/')`;

/**
 * The author of `post` (a workspace comment or reply) while they're still an
 * active member of the share's workspace, and their avatar's key when they have one.
 */
const TEAM_AUTHOR = (post: string) => `LEFT JOIN memberships AS member
    ON member.workspace_id = squint_shares.workspace_id
    AND member.user_id = ${post}.author_user_id
  LEFT JOIN users AS author ON author.id = member.user_id AND author.deleted_at IS NULL
  LEFT JOIN ${AVATAR_JOIN("author")}`;

/**
 * Each comment the owner pushed whose workspace comment (same project, same
 * id) is a team one, with its author (`TEAM_AUTHOR`).
 */
const TEAM_COMMENTS = `squint_shares
  JOIN squint_share_comments AS shared
    ON shared.share_id = squint_shares.id AND shared.origin = 'owner' AND NOT shared.pending
  JOIN comments AS comment
    ON comment.project_id = squint_shares.project_id AND comment.id = shared.id
    AND comment.origin = 'team'
  ${TEAM_AUTHOR("comment")}`;

/**
 * `TEAM_COMMENTS` for replies: each reply the owner pushed whose workspace
 * reply (same project, same id, under the same comment) is a team one.
 */
const TEAM_REPLIES = `squint_shares
  JOIN squint_share_replies AS shared
    ON shared.share_id = squint_shares.id AND shared.origin = 'owner'
  JOIN comment_replies AS reply
    ON reply.project_id = squint_shares.project_id AND reply.id = shared.id
    AND reply.comment_id = shared.comment_id AND reply.origin = 'team'
  ${TEAM_AUTHOR("reply")}`;

interface TeamPostRow {
  post_id: string;
  /** Null once the author has left, and null with `avatar_key` without a photo. */
  user_id: string | null;
  avatar_key: string | null;
}

interface MemberAvatarRow extends BlobRow {
  user_id: string;
}

function toRecord(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    ownerKeyHash: row.owner_key_hash,
    project: row.project,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    reviewWindowHours: row.review_window_hours === null ? null : Number(row.review_window_hours),
    password:
      row.password_hash && row.password_set_at
        ? { hash: row.password_hash, setAt: new Date(row.password_set_at).getTime() }
        : null,
    clientName: row.client_name ?? null,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
  };
}

function toSequenced<T>(row: ItemRow<T>): Sequenced<T> {
  return {
    item: row.data,
    origin: row.origin,
    seq: Number(row.seq),
    ...(row.crop_key ? { cropKey: row.crop_key } : {}),
    ...(row.edit_seq !== null && row.edit_seq !== undefined
      ? { editSeq: Number(row.edit_seq) }
      : {}),
    ...(row.client_info ? { clientInfo: row.client_info } : {}),
  };
}

function toLocation(row: Pick<BlobRow, "bytes" | "blob_url">): BlobLocation {
  return row.blob_url
    ? { kind: "vercel", url: row.blob_url }
    : { kind: "inline", bytes: new Uint8Array(row.bytes ?? []) };
}

function toStoredBlob(row: BlobRow): StoredBlob {
  return {
    key: row.key,
    contentType: row.content_type,
    size: Number(row.size),
    location: toLocation(row),
  };
}

/** Upsert that keeps an existing row's origin and seq, only replacing its data. */
const upsertSql = (table: string) => `INSERT INTO ${table} (share_id, id, data, origin)
  VALUES ($1, $2, $3::jsonb, $4)
  ON CONFLICT (share_id, id) DO UPDATE SET data = EXCLUDED.data`;

/** `upsertSql` for comments, except that a client's row only takes the pushed `pageId` (4.12). */
const UPSERT_COMMENT = `INSERT INTO squint_share_comments AS t (share_id, id, data, origin)
  VALUES ($1, $2, $3::jsonb, $4)
  ON CONFLICT (share_id, id) DO UPDATE SET data = CASE
    WHEN t.origin = 'client'
      THEN t.data || jsonb_strip_nulls(jsonb_build_object('pageId', EXCLUDED.data->'pageId'))
    ELSE EXCLUDED.data
  END`;

/**
 * The owner's reply, only under a visible comment of the link: an owner's row
 * takes it whole; a client's row, or a reply that would move to another
 * comment, stays as it is.
 */
const UPSERT_REPLY = `INSERT INTO squint_share_replies AS t (share_id, comment_id, id, data, origin)
  SELECT $1, $2, $3, $4::jsonb, 'owner'
  WHERE EXISTS (
    SELECT 1 FROM squint_share_comments
    WHERE share_id = $1 AND id = $2 AND NOT pending
  )
  ON CONFLICT (share_id, id) DO UPDATE SET data = EXCLUDED.data
    WHERE t.origin = 'owner' AND t.comment_id = EXCLUDED.comment_id`;

/** A visible client comment, by share and id. */
const CLIENT_ROW = "share_id = $1 AND id = $2 AND origin = 'client' AND NOT pending";

/** Shares in Postgres. Call `migrate()` on the pool first (see `server.ts`). */
export function createPostgresStore(db: Queryable): ShareStore {
  const one = async (where: string, value: string) => {
    const { rows } = await db.query<ShareRow>(
      `SELECT ${READ_COLUMNS} FROM squint_shares WHERE ${where} = $1 AND ${SHARE_ANSWERS}`,
      [value],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  };
  const list = async <T>(table: string, id: string, filter = "", extra = "") => {
    const { rows } = await db.query<ItemRow<T>>(
      `SELECT data, origin, seq${extra} FROM ${table} WHERE share_id = $1 ${filter} ORDER BY seq`,
      [id],
    );
    return rows.map(toSequenced);
  };
  /** `TEAM_COMMENTS` or `TEAM_REPLIES` as a map of each post to its author's avatar on the link. */
  const teamOf = async (id: string, from: string) => {
    const { rows } = await db.query<TeamPostRow>(
      `SELECT shared.id AS post_id, author.id AS user_id, avatar.key AS avatar_key
       FROM ${from} WHERE squint_shares.id = $1 AND ${SHARE_ANSWERS}`,
      [id],
    );
    return new Map<string, TeamAvatar | null>(
      rows.map((row) => [
        row.post_id,
        row.user_id && row.avatar_key
          ? {
              key: sharePersonKey(id, row.user_id),
              version: shareAvatarVersion(id, row.avatar_key),
            }
          : null,
      ]),
    );
  };
  const locations = async (id: string, keys?: readonly string[]) => {
    const { rows } = await db.query<BlobRow>(
      keys
        ? "SELECT bytes, blob_url FROM squint_share_blobs WHERE share_id = $1 AND key = ANY($2)"
        : "SELECT bytes, blob_url FROM squint_share_blobs WHERE share_id = $1",
      keys ? [id, [...keys]] : [id],
    );
    return rows.map(toLocation);
  };

  return {
    async create(record) {
      await db.query(
        `INSERT INTO squint_shares (${SHARE_COLUMNS})
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
        [
          record.id,
          record.tokenHash,
          record.ownerKeyHash,
          JSON.stringify(record.project),
          record.createdAt,
          record.updatedAt,
          record.expiresAt,
          record.reviewWindowHours,
        ],
      );
    },
    byId: (id) => one("id", id),
    byTokenHash: (tokenHash) => one("token_hash", tokenHash),
    async pausedByTokenHash(tokenHash) {
      const { rows } = await db.query<ShareRow>(
        `SELECT ${READ_COLUMNS} FROM squint_shares WHERE token_hash = $1 AND ${SHARE_PAUSED}`,
        [tokenHash],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async exists(id) {
      const { rows } = await db.query("SELECT 1 FROM squint_shares WHERE id = $1", [id]);
      return rows.length === 1;
    },
    async setProject(id, project, at, expiresAt) {
      // A share moved into a workspace since the caller read it keeps no deletion date.
      await db.query(
        `UPDATE squint_shares SET project = $2::jsonb, updated_at = $3,
           expires_at = CASE WHEN workspace_id IS NULL THEN $4::bigint END
         WHERE id = $1`,
        [id, JSON.stringify(project), at, expiresAt],
      );
    },
    async remove(id) {
      const found = await locations(id);
      await db.query("DELETE FROM squint_shares WHERE id = $1", [id]);
      return found;
    },
    async expiredIds(now, limit) {
      const { rows } = await db.query<{ id: string }>(
        `SELECT id FROM squint_shares WHERE workspace_id IS NULL AND expires_at <= $1
         ORDER BY expires_at, id LIMIT $2`,
        [now, limit],
      );
      return rows.map((row) => row.id);
    },
    async brandOf(id) {
      const { rows } = await db.query<BrandRow>(
        `SELECT workspace.name, workspace.brand_color, logo.key AS logo_key
         FROM ${BRAND_FROM} WHERE squint_shares.id = $1 AND ${SHARE_ANSWERS}`,
        [id],
      );
      const row = rows[0];
      if (!row) return SQUINT_BRAND;
      return {
        custom: true,
        name: row.name,
        color: brandColor(row.brand_color),
        logoKey: row.logo_key,
      };
    },
    async brandLogo(id) {
      const { rows } = await db.query<BlobRow>(
        `SELECT logo.key, logo.content_type, logo.size, logo.bytes, logo.blob_url
         FROM ${BRAND_FROM}
         WHERE squint_shares.id = $1 AND logo.key IS NOT NULL AND ${SHARE_ANSWERS}`,
        [id],
      );
      return rows[0] ? toStoredBlob(rows[0]) : null;
    },
    teamAuthors: (id) => teamOf(id, TEAM_COMMENTS),
    teamReplyAuthors: (id) => teamOf(id, TEAM_REPLIES),
    async teamAvatar(id, key) {
      if (!SHARE_PERSON_KEY.test(key)) return null;
      // One HMAC per member with a photo: a handful at most.
      const { rows } = await db.query<MemberAvatarRow>(
        `SELECT member.user_id, avatar.key, avatar.content_type, avatar.size, avatar.bytes,
           avatar.blob_url
         FROM squint_shares
         JOIN memberships AS member ON member.workspace_id = squint_shares.workspace_id
         JOIN users AS account ON account.id = member.user_id AND account.deleted_at IS NULL
         JOIN ${AVATAR_JOIN("account")}
         WHERE squint_shares.id = $1 AND ${SHARE_ANSWERS}`,
        [id],
      );
      const row = rows.find((entry) => sameShareKey(key, sharePersonKey(id, entry.user_id)));
      return row ? { blob: toStoredBlob(row), version: shareAvatarVersion(id, row.key) } : null;
    },
    snapshots: (id, options) =>
      list<SharedSnapshot>(
        "squint_share_snapshots",
        id,
        options?.includePending ? "" : "AND NOT pending",
      ),
    comments: (id, options) =>
      list<SharedComment>(
        "squint_share_comments",
        id,
        options?.includePending ? "" : "AND NOT pending",
        ", crop_key, edit_seq, client_info",
      ),
    async upsertSnapshot(id, snapshot, origin) {
      await db.query(upsertSql("squint_share_snapshots"), [
        id,
        snapshot.id,
        JSON.stringify(snapshot),
        origin,
      ]);
    },
    async upsertComment(id, comment, origin) {
      await db.query(UPSERT_COMMENT, [id, comment.id, JSON.stringify(comment), origin]);
    },
    async insertPendingSnapshot(id, snapshot) {
      await db.query(
        `INSERT INTO squint_share_snapshots (share_id, id, data, origin, pending)
         VALUES ($1, $2, $3::jsonb, 'client', true) ON CONFLICT (share_id, id) DO NOTHING`,
        [id, snapshot.id, JSON.stringify(snapshot)],
      );
    },
    async confirmSnapshot(id, snapshotId) {
      const { rows } = await db.query(
        `UPDATE squint_share_snapshots SET pending = false, seq = nextval('squint_share_seq')
         WHERE share_id = $1 AND id = $2 AND pending RETURNING id`,
        [id, snapshotId],
      );
      return rows.length === 1;
    },
    async deleteStalePendingSnapshots(id, cutoff) {
      const { rows } = await db.query<{ id: string }>(
        `DELETE FROM squint_share_snapshots
         WHERE share_id = $1 AND pending AND (data->>'createdAt')::bigint < $2
         RETURNING id`,
        [id, cutoff],
      );
      return rows.map((row) => row.id);
    },
    async insertComment(id, comment, origin, claim, editKeyHash, clientInfo) {
      const { rows } = await db.query(
        `INSERT INTO squint_share_comments
           (share_id, id, data, origin, pending, claim, crop_key, edit_key_hash, client_info)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (share_id, id) DO NOTHING RETURNING id`,
        [
          id,
          comment.id,
          JSON.stringify(comment),
          origin,
          Boolean(claim),
          claim?.claim ?? null,
          claim?.cropKey ?? null,
          editKeyHash ?? null,
          clientInfo ? JSON.stringify(clientInfo) : null,
        ],
      );
      return rows.length === 1;
    },
    async editClientComment(id, commentId, editKeyHash, body, now) {
      // The key is checked in constant time here; the update then matches the same hash again,
      // so the check and the change can't fall apart. Only the status can have moved in between
      // (a resolve, which takes the same row lock): the update then matches nothing.
      const { rows: found } = await db.query<{ edit_key_hash: string | null }>(
        `SELECT edit_key_hash FROM squint_share_comments WHERE ${CLIENT_ROW}`,
        [id, commentId],
      );
      const stored = found[0]?.edit_key_hash;
      if (!stored || !hashesMatch(editKeyHash, stored)) return "missing";
      const { rows } = await db.query<{ data: SharedComment }>(
        `UPDATE squint_share_comments SET
           data = data || jsonb_build_object('body', $4::text, 'editedAt', $5::bigint,
             'updatedAt', $5::bigint),
           edit_seq = nextval('squint_share_seq')
         WHERE ${CLIENT_ROW} AND edit_key_hash = $3 AND data->>'status' = 'active'
         RETURNING data`,
        [id, commentId, stored, body, now],
      );
      if (rows[0]) return rows[0].data;
      // Resolved, or deleted by the owner's push since the check.
      const { rows: still } = await db.query(
        `SELECT 1 FROM squint_share_comments WHERE ${CLIENT_ROW}`,
        [id, commentId],
      );
      return still.length === 1 ? "locked" : "missing";
    },
    async setClientCommentStatus(id, commentId, { status, resolvedAt, updatedAt }) {
      const { rows } = await db.query(
        `UPDATE squint_share_comments SET data = CASE
           WHEN $3 = 'resolved'
             THEN data || jsonb_build_object('status', 'resolved', 'updatedAt', $5::bigint)
               || jsonb_strip_nulls(jsonb_build_object('resolvedAt', $4::bigint))
           ELSE (data - 'resolvedAt')
             || jsonb_build_object('status', 'active', 'updatedAt', $5::bigint)
         END
         WHERE ${CLIENT_ROW} RETURNING id`,
        [id, commentId, status, resolvedAt, updatedAt],
      );
      return rows.length === 1;
    },
    async confirmComment(id, commentId, claim) {
      const { rows } = await db.query(
        `UPDATE squint_share_comments SET pending = false, seq = nextval('squint_share_seq')
         WHERE share_id = $1 AND id = $2 AND pending AND claim = $3 RETURNING id`,
        [id, commentId, claim],
      );
      return rows.length === 1;
    },
    async deleteClaim(id, commentId, claim) {
      const { rows } = await db.query(
        `DELETE FROM squint_share_comments
         WHERE share_id = $1 AND id = $2 AND pending AND claim = $3 RETURNING id`,
        [id, commentId, claim],
      );
      return rows.length === 1;
    },
    async cropKeyOf(id, commentId) {
      const { rows } = await db.query<{ crop_key: string | null }>(
        "SELECT crop_key FROM squint_share_comments WHERE share_id = $1 AND id = $2 AND NOT pending",
        [id, commentId],
      );
      return rows[0]?.crop_key ?? null;
    },
    async pendingSince(id, commentId) {
      const { rows } = await db.query<{ since: string | number }>(
        `SELECT (data->>'createdAt')::bigint AS since FROM squint_share_comments
         WHERE share_id = $1 AND id = $2 AND pending`,
        [id, commentId],
      );
      return rows[0] ? Number(rows[0].since) : null;
    },
    async deleteStalePending(id, cutoff, commentId) {
      const { rows } = await db.query<{ id: string }>(
        `DELETE FROM squint_share_comments
         WHERE share_id = $1 AND pending AND (data->>'createdAt')::bigint < $2
           AND ($3::text IS NULL OR id = $3)
         RETURNING id`,
        [id, cutoff, commentId ?? null],
      );
      return rows.map((row) => row.id);
    },
    async deleteSnapshots(id, ids) {
      await db.query("DELETE FROM squint_share_snapshots WHERE share_id = $1 AND id = ANY($2)", [
        id,
        [...ids],
      ]);
    },
    async deleteComments(id, ids) {
      await db.query("DELETE FROM squint_share_comments WHERE share_id = $1 AND id = ANY($2)", [
        id,
        [...ids],
      ]);
    },
    replies: (id) => list<SharedReply>("squint_share_replies", id, "", ", client_info"),
    async upsertReply(id, reply) {
      await db.query(UPSERT_REPLY, [id, reply.commentId, reply.id, JSON.stringify(reply)]);
    },
    async insertReply(id, reply, origin, clientInfo) {
      const { rows } = await db.query(
        `INSERT INTO squint_share_replies (share_id, comment_id, id, data, origin, client_info)
         SELECT $1, $2, $3, $4::jsonb, $5, $6::jsonb
         WHERE EXISTS (
           SELECT 1 FROM squint_share_comments
           WHERE share_id = $1 AND id = $2 AND NOT pending
         )
         ON CONFLICT (share_id, id) DO NOTHING RETURNING id`,
        [
          id,
          reply.commentId,
          reply.id,
          JSON.stringify(reply),
          origin,
          clientInfo ? JSON.stringify(clientInfo) : null,
        ],
      );
      return rows.length === 1;
    },
    async deleteReplies(id, ids) {
      await db.query("DELETE FROM squint_share_replies WHERE share_id = $1 AND id = ANY($2)", [
        id,
        [...ids],
      ]);
    },
    async blobSizes(id) {
      const { rows } = await db.query<Pick<BlobRow, "key" | "size">>(
        "SELECT key, size FROM squint_share_blobs WHERE share_id = $1",
        [id],
      );
      return rows.map(({ key, size }) => ({ key, size: Number(size) }));
    },
    async getBlob(id, key) {
      const { rows } = await db.query<BlobRow>(
        "SELECT key, content_type, size, bytes, blob_url FROM squint_share_blobs WHERE share_id = $1 AND key = $2",
        [id, key],
      );
      return rows[0] ? toStoredBlob(rows[0]) : null;
    },
    async putBlob(id, blob) {
      const inline = blob.location.kind === "inline" ? blob.location.bytes : null;
      const url = blob.location.kind === "vercel" ? blob.location.url : null;
      await db.query(
        `INSERT INTO squint_share_blobs (share_id, key, content_type, size, bytes, blob_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (share_id, key) DO UPDATE SET content_type = EXCLUDED.content_type,
           size = EXCLUDED.size, bytes = EXCLUDED.bytes, blob_url = EXCLUDED.blob_url`,
        [id, blob.key, blob.contentType, blob.size, inline, url],
      );
    },
    async putBlobPart(id, key, part, bytes) {
      await db.query(
        `INSERT INTO squint_share_blob_parts (share_id, key, part, bytes) VALUES ($1, $2, $3, $4)
         ON CONFLICT (share_id, key, part) DO UPDATE SET bytes = EXCLUDED.bytes`,
        [id, key, part, bytes],
      );
    },
    async blobParts(id, key) {
      const { rows } = await db.query<{ part: number; bytes: Uint8Array }>(
        "SELECT part, bytes FROM squint_share_blob_parts WHERE share_id = $1 AND key = $2 ORDER BY part",
        [id, key],
      );
      return rows.map((row) => ({ part: Number(row.part), bytes: new Uint8Array(row.bytes) }));
    },
    async deleteBlobParts(id, key) {
      await db.query("DELETE FROM squint_share_blob_parts WHERE share_id = $1 AND key = $2", [
        id,
        key,
      ]);
    },
    async deleteBlobs(id, keys) {
      if (keys.length === 0) return [];
      const found = await locations(id, keys);
      await db.query("DELETE FROM squint_share_blobs WHERE share_id = $1 AND key = ANY($2)", [
        id,
        [...keys],
      ]);
      return found;
    },
  };
}
