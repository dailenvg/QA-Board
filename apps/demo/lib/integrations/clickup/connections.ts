import { audit, type AccountAction } from "../../account/audit";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { toDate } from "../../workspace/times";
import { sealSecret } from "../../workspace/sealed-secrets";
import type { ClickUpTeam, ClickUpUser } from "./api";

/**
 * A member's own ClickUp connection in a workspace (040): which ClickUp
 * workspace, whose personal token, and the token, sealed to the member and
 * the workspace. Each member connects and disconnects their own; nobody
 * else sees it, and the token never leaves the server.
 */

/** Whose connection: a member of a workspace. */
export interface ClickUpActor {
  userId: string;
  workspaceId: string;
}

/** What the profile settings show of a connection. */
export interface ClickUpConnection {
  /** The ClickUp workspace's name, as ClickUp gave it when connecting. */
  teamName: string;
  /** The ClickUp user the token belongs to: messages appear under their name. */
  clickUpUsername: string;
  /** Epoch ms. */
  connectedAt: number;
}

/** What a member's token is sealed to: the workspace, the member and the field. */
export function clickUpTokenContext({ workspaceId, userId }: ClickUpActor): string {
  return `clickup/${workspaceId}/${userId}/access-token`;
}

/**
 * What a token copied from a workspace connection (039) was sealed to: the
 * workspace alone. Only opened for the member who connected it (040 copied
 * it to them), then sealed again with `clickUpTokenContext`.
 */
export function legacyClickUpTokenContext(workspaceId: string): string {
  return `clickup/${workspaceId}/access-token`;
}

interface ConnectionRow {
  clickup_team_name: string;
  clickup_username: string;
  connected_at: Date;
}

export async function loadClickUpConnection(
  db: Queryable,
  actor: ClickUpActor,
): Promise<ClickUpConnection | null> {
  const { rows } = await db.query<ConnectionRow>(
    `SELECT clickup_team_name, clickup_username, connected_at FROM user_clickup_connections
     WHERE user_id = $1 AND workspace_id = $2`,
    [actor.userId, actor.workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    teamName: row.clickup_team_name,
    clickUpUsername: row.clickup_username,
    connectedAt: new Date(row.connected_at).getTime(),
  };
}

/** What connecting saves: the token, whose it is, and the ClickUp workspace picked. */
export interface NewClickUpConnection {
  token: string;
  user: ClickUpUser;
  team: ClickUpTeam;
}

/** Records a member's change to their own connection, in their workspace's log too. */
function auditConnection(tx: Queryable, actor: ClickUpActor, action: AccountAction, now: number) {
  return audit(
    tx,
    {
      actorUserId: actor.userId,
      workspaceId: actor.workspaceId,
      action,
      target: { type: "user", id: actor.userId },
      fields: ["clickup"],
    },
    now,
  );
}

/**
 * Forgets the member's connection from before 040, if any: the workspace's
 * row (039) they connected, which holds their token too.
 */
function forgetLegacyConnection(tx: Queryable, actor: ClickUpActor) {
  return tx.query(
    "DELETE FROM workspace_clickup_connections WHERE workspace_id = $1 AND connected_by = $2",
    [actor.workspaceId, actor.userId],
  );
}

/**
 * Connects the actor to `team` with `token` (sealed here), in place of any
 * connection they had, and records it.
 */
export function saveClickUpConnection(
  db: Database,
  actor: ClickUpActor,
  { token, user, team }: NewClickUpConnection,
  now: number,
  secret?: string,
): Promise<void> {
  const sealed = sealSecret(token, clickUpTokenContext(actor), secret);
  return db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO user_clickup_connections
         (user_id, workspace_id, clickup_team_id, clickup_team_name, clickup_user_id,
          clickup_username, access_token_sealed, sealed_for, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'user', $8)
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET
         clickup_team_id = EXCLUDED.clickup_team_id,
         clickup_team_name = EXCLUDED.clickup_team_name,
         clickup_user_id = EXCLUDED.clickup_user_id,
         clickup_username = EXCLUDED.clickup_username,
         access_token_sealed = EXCLUDED.access_token_sealed,
         sealed_for = EXCLUDED.sealed_for, connected_at = EXCLUDED.connected_at`,
      [
        actor.userId,
        actor.workspaceId,
        team.id,
        team.name,
        user.id,
        user.username,
        sealed,
        toDate(now),
      ],
    );
    await forgetLegacyConnection(tx, actor);
    await auditConnection(tx, actor, "user.clickup_connected", now);
  });
}

/** Disconnects the actor from ClickUp, and records it; false when they weren't connected. */
export function removeClickUpConnection(
  db: Database,
  actor: ClickUpActor,
  now: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM user_clickup_connections WHERE user_id = $1 AND workspace_id = $2
       RETURNING user_id`,
      [actor.userId, actor.workspaceId],
    );
    await forgetLegacyConnection(tx, actor);
    if (rows.length === 0) return false;
    await auditConnection(tx, actor, "user.clickup_disconnected", now);
    return true;
  });
}
