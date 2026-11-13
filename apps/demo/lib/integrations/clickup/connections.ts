import type { WorkspaceActor } from "../../account/workspace-logo";
import { auditWorkspace } from "../../account/audit";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { toDate } from "../../workspace/times";
import { sealSecret } from "../../workspace/sealed-secrets";
import type { ClickUpTeam, ClickUpUser } from "./api";

/**
 * A workspace's ClickUp connection (039): which ClickUp workspace, whose
 * personal token, and the token, sealed to its workspace. Only the owner
 * connects or disconnects; every member can see what's connected, never the token.
 */

/** What the settings page shows of a connection. */
export interface ClickUpConnection {
  /** The ClickUp workspace's name, as ClickUp gave it when connecting. */
  teamName: string;
  /** The ClickUp user the token belongs to: posts appear under their name. */
  clickUpUsername: string;
  /** Who connected it: their name, else their email; null once their account is deleted. */
  connectedBy: string | null;
  /** Epoch ms. */
  connectedAt: number;
}

/** What a workspace's token is sealed to: the workspace and the field. */
export function clickUpTokenContext(workspaceId: string): string {
  return `clickup/${workspaceId}/access-token`;
}

interface ConnectionRow {
  clickup_team_name: string;
  clickup_username: string;
  connected_by: string | null;
  connected_at: Date;
}

export async function loadClickUpConnection(
  db: Queryable,
  workspaceId: string,
): Promise<ClickUpConnection | null> {
  const { rows } = await db.query<ConnectionRow>(
    `SELECT connection.clickup_team_name, connection.clickup_username, connection.connected_at,
       CASE WHEN who.deleted_at IS NULL THEN coalesce(who.name, who.email) END AS connected_by
     FROM workspace_clickup_connections AS connection
     LEFT JOIN users AS who ON who.id = connection.connected_by
     WHERE connection.workspace_id = $1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    teamName: row.clickup_team_name,
    clickUpUsername: row.clickup_username,
    connectedBy: row.connected_by,
    connectedAt: new Date(row.connected_at).getTime(),
  };
}

/** What connecting saves: the token, whose it is, and the ClickUp workspace picked. */
export interface NewClickUpConnection {
  token: string;
  user: ClickUpUser;
  team: ClickUpTeam;
}

/**
 * Connects `team` to the actor's workspace with `token` (sealed here), in
 * place of any connection it had, and records it.
 */
export function saveClickUpConnection(
  db: Database,
  actor: WorkspaceActor,
  { token, user, team }: NewClickUpConnection,
  now: number,
  secret?: string,
): Promise<void> {
  const sealed = sealSecret(token, clickUpTokenContext(actor.workspaceId), secret);
  return db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO workspace_clickup_connections
         (workspace_id, clickup_team_id, clickup_team_name, clickup_user_id, clickup_username,
          access_token_sealed, connected_by, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workspace_id) DO UPDATE SET clickup_team_id = EXCLUDED.clickup_team_id,
         clickup_team_name = EXCLUDED.clickup_team_name,
         clickup_user_id = EXCLUDED.clickup_user_id,
         clickup_username = EXCLUDED.clickup_username,
         access_token_sealed = EXCLUDED.access_token_sealed,
         connected_by = EXCLUDED.connected_by, connected_at = EXCLUDED.connected_at`,
      [
        actor.workspaceId,
        team.id,
        team.name,
        user.id,
        user.username,
        sealed,
        actor.userId,
        toDate(now),
      ],
    );
    await auditWorkspace(tx, actor, "workspace.clickup_connected", ["clickup"], now);
  });
}

/** Disconnects the actor's workspace from ClickUp, and records it; false when it wasn't connected. */
export function removeClickUpConnection(
  db: Database,
  actor: WorkspaceActor,
  now: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      "DELETE FROM workspace_clickup_connections WHERE workspace_id = $1 RETURNING workspace_id",
      [actor.workspaceId],
    );
    if (rows.length === 0) return false;
    await auditWorkspace(tx, actor, "workspace.clickup_disconnected", ["clickup"], now);
    return true;
  });
}
