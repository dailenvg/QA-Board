import { brandColor, SQUINT_BRAND } from "./brand";
import type { Queryable } from "./migrate";
import { sameShareKey, SHARE_PERSON_KEY, shareAvatarVersion, sharePersonKey } from "./share-people";
import type { ShareStore } from "./store";
import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
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

/**
 * A share answers like a revoked one while its workspace project is in the
 * trash (migration 024) or archived (015), or its workspace is archived (009)
 * or waiting to be deleted (033), until it's restored or un-archived.
 * Anonymous shares have neither.
 */
const ANSWERS = `NOT EXISTS (
  SELECT 1 FROM projects AS project
  WHERE project.id = squint_shares.project_id
    AND project.workspace_id = squint_shares.workspace_id
    AND (project.deleted_at IS NOT NULL OR project.archived_at IS NOT NULL)
) AND NOT EXISTS (
  SELECT 1 FROM workspaces AS closed
  WHERE closed.id = squint_shares.workspace_id
    AND (closed.archived_at IS NOT NULL OR closed.delete_after IS NOT NULL)
)`;

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
 * Each comment the owner pushed whose workspace comment (same project, same
 * id) is a team one, with its author while they're still an active member of
 * the share's workspace, and their avatar's key when they have one.
 */
const TEAM_COMMENTS = `squint_shares
  JOIN squint_share_comments AS shared
    ON shared.share_id = squint_shares.id AND shared.origin = 'owner' AND NOT shared.pending
  JOIN comments AS comment
    ON comment.project_id = squint_shares.project_id AND comment.id = shared.id
    AND comment.origin = 'team'
  LEFT JOIN memberships AS member
    ON member.workspace_id = squint_shares.workspace_id
    AND member.user_id = comment.author_user_id
  LEFT JOIN users AS author ON author.id = member.user_id AND author.deleted_at IS NULL
  LEFT JOIN ${AVATAR_JOIN("author")}`;

interface TeamCommentRow {
  comment_id: string;
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
  const sequenced: Sequenced<T> = { item: row.data, origin: row.origin, seq: Number(row.seq) };
  return row.crop_key ? { ...sequenced, cropKey: row.crop_key } : sequenced;
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

/** Shares in Postgres. Call `migrate()` on the pool first (see `server.ts`). */
export function createPostgresStore(db: Queryable): ShareStore {
  const one = async (where: string, value: string) => {
    const { rows } = await db.query<ShareRow>(
      `SELECT ${READ_COLUMNS} FROM squint_shares WHERE ${where} = $1 AND ${ANSWERS}`,
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
         FROM ${BRAND_FROM} WHERE squint_shares.id = $1 AND ${ANSWERS}`,
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
         WHERE squint_shares.id = $1 AND logo.key IS NOT NULL AND ${ANSWERS}`,
        [id],
      );
      return rows[0] ? toStoredBlob(rows[0]) : null;
    },
    async teamAuthors(id) {
      const { rows } = await db.query<TeamCommentRow>(
        `SELECT shared.id AS comment_id, author.id AS user_id, avatar.key AS avatar_key
         FROM ${TEAM_COMMENTS} WHERE squint_shares.id = $1 AND ${ANSWERS}`,
        [id],
      );
      return new Map(
        rows.map((row) => [
          row.comment_id,
          row.user_id && row.avatar_key
            ? {
                key: sharePersonKey(id, row.user_id),
                version: shareAvatarVersion(id, row.avatar_key),
              }
            : null,
        ]),
      );
    },
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
         WHERE squint_shares.id = $1 AND ${ANSWERS}`,
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
        ", crop_key",
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
      await db.query(upsertSql("squint_share_comments"), [
        id,
        comment.id,
        JSON.stringify(comment),
        origin,
      ]);
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
    async insertComment(id, comment, origin, claim) {
      const { rows } = await db.query(
        `INSERT INTO squint_share_comments (share_id, id, data, origin, pending, claim, crop_key)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
         ON CONFLICT (share_id, id) DO NOTHING RETURNING id`,
        [
          id,
          comment.id,
          JSON.stringify(comment),
          origin,
          Boolean(claim),
          claim?.claim ?? null,
          claim?.cropKey ?? null,
        ],
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
