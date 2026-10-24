import type { Queryable } from "./migrate";
import type { ShareStore } from "./store";
import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedSnapshot,
  ShareRecord,
} from "./types";

interface ShareRow {
  id: string;
  token_hash: string;
  owner_key_hash: string;
  project: SharedProject;
  created_at: string | number;
  updated_at: string | number;
}

interface ItemRow<T> {
  data: T;
  origin: Origin;
  seq: string | number;
}

interface BlobRow {
  key: string;
  content_type: string;
  size: number;
  bytes: Uint8Array | null;
  blob_url: string | null;
}

const SHARE_COLUMNS = "id, token_hash, owner_key_hash, project, created_at, updated_at";

function toRecord(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    ownerKeyHash: row.owner_key_hash,
    project: row.project,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toSequenced<T>(row: ItemRow<T>): Sequenced<T> {
  return { item: row.data, origin: row.origin, seq: Number(row.seq) };
}

function toLocation(row: Pick<BlobRow, "bytes" | "blob_url">): BlobLocation {
  return row.blob_url
    ? { kind: "vercel", url: row.blob_url }
    : { kind: "inline", bytes: new Uint8Array(row.bytes ?? []) };
}

/** Upsert that keeps an existing row's origin and seq, only replacing its data. */
const upsertSql = (table: string) => `INSERT INTO ${table} (share_id, id, data, origin)
  VALUES ($1, $2, $3::jsonb, $4)
  ON CONFLICT (share_id, id) DO UPDATE SET data = EXCLUDED.data`;

/** Shares in Postgres. Call `migrate()` on the pool first (see `server.ts`). */
export function createPostgresStore(db: Queryable): ShareStore {
  const one = async (where: string, value: string) => {
    const { rows } = await db.query<ShareRow>(
      `SELECT ${SHARE_COLUMNS} FROM squint_shares WHERE ${where} = $1`,
      [value],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  };
  const list = async <T>(table: string, id: string, filter = "") => {
    const { rows } = await db.query<ItemRow<T>>(
      `SELECT data, origin, seq FROM ${table} WHERE share_id = $1 ${filter} ORDER BY seq`,
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
        `INSERT INTO squint_shares (${SHARE_COLUMNS}) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          record.id,
          record.tokenHash,
          record.ownerKeyHash,
          JSON.stringify(record.project),
          record.createdAt,
          record.updatedAt,
        ],
      );
    },
    byId: (id) => one("id", id),
    byTokenHash: (tokenHash) => one("token_hash", tokenHash),
    async setProject(id, project, at) {
      await db.query(
        "UPDATE squint_shares SET project = $2::jsonb, updated_at = $3 WHERE id = $1",
        [id, JSON.stringify(project), at],
      );
    },
    async remove(id) {
      const found = await locations(id);
      await db.query("DELETE FROM squint_shares WHERE id = $1", [id]);
      return found;
    },
    snapshots: (id) => list<SharedSnapshot>("squint_share_snapshots", id),
    comments: (id, options) =>
      list<SharedComment>(
        "squint_share_comments",
        id,
        options?.includePending ? "" : "AND NOT pending",
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
    async insertComment(id, comment, origin, options) {
      const { rows } = await db.query(
        `INSERT INTO squint_share_comments (share_id, id, data, origin, pending)
         VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (share_id, id) DO NOTHING RETURNING id`,
        [id, comment.id, JSON.stringify(comment), origin, options?.pending ?? false],
      );
      return rows.length === 1;
    },
    async confirmComment(id, commentId) {
      await db.query(
        `UPDATE squint_share_comments SET pending = false, seq = nextval('squint_share_seq')
         WHERE share_id = $1 AND id = $2 AND pending`,
        [id, commentId],
      );
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
      const row = rows[0];
      if (!row) return null;
      return {
        key: row.key,
        contentType: row.content_type,
        size: Number(row.size),
        location: toLocation(row),
      };
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
