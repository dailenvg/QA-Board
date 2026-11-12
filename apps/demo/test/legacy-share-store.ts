import type { Queryable } from "@/lib/share/migrate";
import { createPostgresStore } from "@/lib/share/postgres-store";
import type { ShareStore } from "@/lib/share/store";

/**
 * The Postgres share store, writing new shares with only the columns they had
 * before migration 035 (no review window): for tests that put shares in an
 * older schema, then migrate over them. Use it for reads only once migrated.
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
  };
}
