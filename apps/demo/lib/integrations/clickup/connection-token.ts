import { describeError } from "../../auth/http";
import type { Database } from "../../db/database";
import { openSecret, sealSecret } from "../../workspace/sealed-secrets";
import { clickUpTokenContext, legacyClickUpTokenContext, type ClickUpActor } from "./connections";

/** A member's connection, opened to call ClickUp with. Server only: never answered. */
export interface OpenedClickUpConnection {
  token: string;
  /** The ClickUp workspace it's connected to. */
  teamId: string;
}

/**
 * The actor's connection, opened; null when they have none; "unreadable"
 * when its token can't be opened (`AUTH_SECRET` changed since, or a copied
 * token that isn't theirs), so they connect again.
 */
export type ClickUpTokenRead = OpenedClickUpConnection | "unreadable" | null;

interface TokenRow {
  clickup_team_id: string;
  access_token_sealed: string;
  sealed_for: "user" | "workspace";
  /** Whether the workspace connection (039) it was copied from is still the actor's, with this token. */
  copied_from_own: boolean;
}

/**
 * A token copied from the workspace connection (039), sealed to the
 * workspace alone, sealed again to the actor; the workspace's row, which
 * held the same token, goes. Only if nothing changed it meanwhile.
 */
async function resealCopiedToken(
  db: Database,
  actor: ClickUpActor,
  sealed: string,
  token: string,
  secret?: string,
): Promise<void> {
  const resealed = sealSecret(token, clickUpTokenContext(actor), secret);
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE user_clickup_connections SET access_token_sealed = $3, sealed_for = 'user'
       WHERE user_id = $1 AND workspace_id = $2 AND sealed_for = 'workspace'
         AND access_token_sealed = $4
       RETURNING user_id`,
      [actor.userId, actor.workspaceId, resealed, sealed],
    );
    if (rows.length === 0) return;
    await tx.query(
      "DELETE FROM workspace_clickup_connections WHERE workspace_id = $1 AND connected_by = $2",
      [actor.workspaceId, actor.userId],
    );
  });
}

/**
 * Opens the actor's ClickUp token. One copied by 040 from the workspace
 * connection opens only while that connection is still the actor's with the
 * same token (so a copy can't serve anyone else), and is sealed to the actor
 * as it's opened. Failures are logged by kind only.
 */
export async function openClickUpConnection(
  db: Database,
  actor: ClickUpActor,
  secret?: string,
): Promise<ClickUpTokenRead> {
  const { rows } = await db.query<TokenRow>(
    `SELECT connection.clickup_team_id, connection.access_token_sealed, connection.sealed_for,
       EXISTS (
         SELECT 1 FROM workspace_clickup_connections AS legacy
         WHERE legacy.workspace_id = connection.workspace_id
           AND legacy.connected_by = connection.user_id
           AND legacy.access_token_sealed = connection.access_token_sealed
       ) AS copied_from_own
     FROM user_clickup_connections AS connection
     WHERE connection.user_id = $1 AND connection.workspace_id = $2`,
    [actor.userId, actor.workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  const copied = row.sealed_for === "workspace";
  if (copied && !row.copied_from_own) return "unreadable";
  let token: string;
  try {
    const context = copied
      ? legacyClickUpTokenContext(actor.workspaceId)
      : clickUpTokenContext(actor);
    token = openSecret(row.access_token_sealed, context, secret);
  } catch (error) {
    console.error(`squint clickup: token unreadable (${describeError(error)})`);
    return "unreadable";
  }
  if (copied) await resealCopiedToken(db, actor, row.access_token_sealed, token, secret);
  return { token, teamId: row.clickup_team_id };
}
