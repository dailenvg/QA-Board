import type { Queryable } from "@/lib/share/migrate";
import { createPostgresStore } from "@/lib/share/postgres-store";
import type { ShareStore } from "@/lib/share/store";
import type { Origin, SharedComment } from "@/lib/share/types";

interface CommentRow {
  data: SharedComment;
  origin: Origin;
  seq: string | number;
  crop_key: string | null;
}

/**
 * The Postgres share store, writing new shares with only the columns they had
 * before migration 035 (no review window), and reading comments without
 * 045's edit sequence: for tests that put shares in an older schema, then
 * migrate over them. Use it for other reads only once migrated.
 */
export function storeBefore035(db: Queryable): ShareStore {
  const store = createPostgresStore(db);
  return {
    ...store,
    async create(record) {
      await db.query(
        `INSERT INTO squint_shares
           (id, token_hash, owner_key_hash, project, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [
          record.id,
          record.tokenHash,
          record.ownerKeyHash,
          JSON.stringify(record.project),
          record.createdAt,
          record.updatedAt,
          record.expiresAt,
        ],
      );
    },
    async comments(id, options) {
      const { rows } = await db.query<CommentRow>(
        `SELECT data, origin, seq, crop_key FROM squint_share_comments
         WHERE share_id = $1 ${options?.includePending ? "" : "AND NOT pending"} ORDER BY seq`,
        [id],
      );
      return rows.map((row) => ({
        item: row.data,
        origin: row.origin,
        seq: Number(row.seq),
        ...(row.crop_key ? { cropKey: row.crop_key } : {}),
      }));
    },
  };
}
