import type { Queryable } from "../share/migrate";
import { isExpired } from "../share/retention";
import { secretMatches } from "../share/tokens";
import { openSecret, sealSecret } from "./sealed-secrets";
import type { ShareAttach, ShareSync } from "./schemas";
import { toDate, toMs } from "./times";
import { done, refuse, type QueryResult } from "./query-result";
import type { ShareLink } from "./types";

/**
 * A workspace project's review link (023). Its token and owner key are sealed
 * at rest (`sealed-secrets.ts`), each bound to its workspace, project and
 * field, and only opened for a member of that workspace.
 */

const context = (workspaceId: string, projectId: string, field: "token" | "owner-key") =>
  `share-link:${workspaceId}:${projectId}:${field}`;

interface LinkRow {
  share_id: string;
  token_sealed: string;
  owner_key_sealed: string;
  cursor: string | number;
  last_synced_at: Date | null;
  share_created_at: string | number;
}

/** A live project's link with its secrets, or null when it has none. */
export async function getShareLink(
  db: Queryable,
  workspaceId: string,
  projectId: string,
  secret?: string,
): Promise<ShareLink | null> {
  const { rows } = await db.query<LinkRow>(
    `SELECT link.share_id, link.token_sealed, link.owner_key_sealed, link.cursor,
       link.last_synced_at, share.created_at AS share_created_at
     FROM project_share_links AS link
     JOIN projects AS project
       ON project.workspace_id = link.workspace_id AND project.id = link.project_id
     JOIN squint_shares AS share ON share.id = link.share_id
     WHERE link.workspace_id = $1 AND link.project_id = $2 AND project.deleted_at IS NULL`,
    [workspaceId, projectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.share_id,
    token: openSecret(row.token_sealed, context(workspaceId, projectId, "token"), secret),
    ownerKey: openSecret(
      row.owner_key_sealed,
      context(workspaceId, projectId, "owner-key"),
      secret,
    ),
    createdAt: Number(row.share_created_at),
    cursor: Number(row.cursor),
    ...(row.last_synced_at ? { lastSyncedAt: toMs(row.last_synced_at) } : {}),
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

/**
 * Makes a share the review link of a live project of the workspace. The
 * caller proves it owns the share with its owner key (checked against
 * `owner_key_hash`) and token; a share made without signing in then joins the
 * workspace and stops deleting itself after 30 days. A share already in
 * another workspace, or on another project, answers like an unknown one.
 * Run inside a transaction.
 */
export async function attachShare(
  tx: Queryable,
  workspaceId: string,
  projectId: string,
  input: ShareAttach & { cursor?: number; lastSyncedAt?: number },
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
    `UPDATE squint_shares SET workspace_id = $2, project_id = $3, expires_at = NULL WHERE id = $1`,
    [input.shareId, workspaceId, projectId],
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
