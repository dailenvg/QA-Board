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
import sharesWorkspace from "../../migrations/022_squint_shares_workspace.sql";
import projectShareLinks from "../../migrations/023_project_share_links.sql";
import projectsDeletedAt from "../../migrations/024_projects_deleted_at.sql";
import workspaceBlobsInline from "../../migrations/025_workspace_blobs_inline.sql";
import projectsFolderOptional from "../../migrations/026_projects_folder_optional.sql";
import emailChanges from "../../migrations/027_email_changes.sql";
import usersNameLength from "../../migrations/028_users_name_length.sql";
import userBlobs from "../../migrations/029_user_blobs.sql";
import senderNameLength from "../../migrations/030_workspaces_sender_name_length.sql";
import commentsOrigin from "../../migrations/031_comments_origin.sql";
import projectsDeleteAfter from "../../migrations/032_projects_delete_after.sql";
import accountDeletion from "../../migrations/033_account_deletion.sql";
import sharesInviter from "../../migrations/034_squint_shares_inviter_backfill.sql";
import sharesReviewWindow from "../../migrations/035_squint_shares_review_window.sql";

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
  { id: "022_squint_shares_workspace", sql: sharesWorkspace },
  { id: "023_project_share_links", sql: projectShareLinks },
  { id: "024_projects_deleted_at", sql: projectsDeletedAt },
  { id: "025_workspace_blobs_inline", sql: workspaceBlobsInline },
  { id: "026_projects_folder_optional", sql: projectsFolderOptional },
  { id: "027_email_changes", sql: emailChanges },
  { id: "028_users_name_length", sql: usersNameLength },
  { id: "029_user_blobs", sql: userBlobs },
  { id: "030_workspaces_sender_name_length", sql: senderNameLength },
  { id: "031_comments_origin", sql: commentsOrigin },
  { id: "032_projects_delete_after", sql: projectsDeleteAfter },
  { id: "033_account_deletion", sql: accountDeletion },
  { id: "034_squint_shares_inviter_backfill", sql: sharesInviter },
  { id: "035_squint_shares_review_window", sql: sharesReviewWindow },
];

type Migration = (typeof MIGRATIONS)[number];

/**
 * Applies pending migrations and returns the ids it ran. Applied ids are
 * recorded in `squint_migrations`, so a second run skips them. Concurrent runs
 * are not safe: two can both see a migration as pending, and DDL racing on an
 * empty database fails even with `IF NOT EXISTS`. The app runs it through
 * `migrateWithLock`; tests call it directly on one connection. Tests pass a
 * prefix of `MIGRATIONS` to stop at an older schema.
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
