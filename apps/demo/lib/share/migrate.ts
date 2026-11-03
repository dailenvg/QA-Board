import shares from "../../migrations/001_squint_shares.sql";
import blobParts from "../../migrations/002_squint_share_blob_parts.sql";
import pendingComments from "../../migrations/003_squint_share_pending_comments.sql";
import commentClaims from "../../migrations/004_squint_share_comment_claims.sql";
import pendingSnapshots from "../../migrations/005_squint_share_pending_snapshots.sql";
import pages from "../../migrations/006_squint_share_pages.sql";
import expiresAt from "../../migrations/007_squint_shares_expires_at.sql";
import users from "../../migrations/008_users.sql";
import workspaces from "../../migrations/009_workspaces.sql";
import memberships from "../../migrations/010_memberships.sql";
import sessions from "../../migrations/011_sessions.sql";
import passwordResets from "../../migrations/012_password_resets.sql";
import loginAttempts from "../../migrations/013_login_attempts.sql";
import folders from "../../migrations/014_folders.sql";
import projects from "../../migrations/015_projects.sql";
import projectPages from "../../migrations/016_pages.sql";
import snapshots from "../../migrations/017_snapshots.sql";
import comments from "../../migrations/018_comments.sql";
import workspaceBlobs from "../../migrations/019_workspace_blobs.sql";
import storageUsage from "../../migrations/020_storage_usage.sql";
import auditLog from "../../migrations/021_audit_log.sql";

/** The slice of `pg.Pool` the stores use (PGlite matches it in tests). */
export interface Queryable {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

/** Ordered migrations from `apps/demo/migrations`. Add new files; never edit an applied one. */
export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  { id: "001_squint_shares", sql: shares },
  { id: "002_squint_share_blob_parts", sql: blobParts },
  { id: "003_squint_share_pending_comments", sql: pendingComments },
  { id: "004_squint_share_comment_claims", sql: commentClaims },
  { id: "005_squint_share_pending_snapshots", sql: pendingSnapshots },
  { id: "006_squint_share_pages", sql: pages },
  { id: "007_squint_shares_expires_at", sql: expiresAt },
  { id: "008_users", sql: users },
  { id: "009_workspaces", sql: workspaces },
  { id: "010_memberships", sql: memberships },
  { id: "011_sessions", sql: sessions },
  { id: "012_password_resets", sql: passwordResets },
  { id: "013_login_attempts", sql: loginAttempts },
  { id: "014_folders", sql: folders },
  { id: "015_projects", sql: projects },
  { id: "016_pages", sql: projectPages },
  { id: "017_snapshots", sql: snapshots },
  { id: "018_comments", sql: comments },
  { id: "019_workspace_blobs", sql: workspaceBlobs },
  { id: "020_storage_usage", sql: storageUsage },
  { id: "021_audit_log", sql: auditLog },
];

type Migration = (typeof MIGRATIONS)[number];

/**
 * Applies pending migrations and returns the ids it ran. Safe on every cold
 * start: applied ids are recorded in `squint_migrations`, and the SQL itself
 * only uses `IF NOT EXISTS` or touches rows still in an old shape, so
 * concurrent runs are harmless. Tests pass a prefix of `MIGRATIONS` to stop
 * at an older schema.
 */
export async function migrate(
  db: Queryable,
  migrations: ReadonlyArray<Migration> = MIGRATIONS,
): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS squint_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await db.query<{ id: string }>("SELECT id FROM squint_migrations");
  const applied = new Set(rows.map((row) => row.id));
  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.query(migration.sql);
    await db.query("INSERT INTO squint_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [
      migration.id,
    ]);
    ran.push(migration.id);
  }
  return ran;
}
