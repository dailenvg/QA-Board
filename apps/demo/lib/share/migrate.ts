import shares from "../../migrations/001_squint_shares.sql";
import blobParts from "../../migrations/002_squint_share_blob_parts.sql";
import pendingComments from "../../migrations/003_squint_share_pending_comments.sql";
import commentClaims from "../../migrations/004_squint_share_comment_claims.sql";

/** The slice of `pg.Pool` the share store uses (PGlite matches it in tests). */
export interface Queryable {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

/** Ordered migrations from `apps/demo/migrations`. Add new files; never edit an applied one. */
export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  { id: "001_squint_shares", sql: shares },
  { id: "002_squint_share_blob_parts", sql: blobParts },
  { id: "003_squint_share_pending_comments", sql: pendingComments },
  { id: "004_squint_share_comment_claims", sql: commentClaims },
];

/**
 * Applies pending migrations and returns the ids it ran. Safe on every cold
 * start: applied ids are recorded in `squint_migrations`, and the SQL itself
 * only uses `IF NOT EXISTS`, so concurrent runs are harmless.
 */
export async function migrate(db: Queryable): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS squint_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ id: string }>("SELECT id FROM squint_migrations");
  const applied = new Set(rows.map((row) => row.id));
  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.query(migration.sql);
    await db.query("INSERT INTO squint_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [
      migration.id,
    ]);
    ran.push(migration.id);
  }
  return ran;
}
