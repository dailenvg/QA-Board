import { audit } from "../../account/audit";
import { can } from "../../auth/permissions";
import type { Database } from "../../db/database";
import { toDate } from "../times";
import { actorAccess, lockMembers, lockOpenWorkspace } from "./locks";

/**
 * Cancelling an invite (4.4): its link stops working and its seat is free at
 * once. Anyone who may manage invites cancels any of them (D2). Cancelling it
 * again changes nothing and answers the same. To end a leaked link, cancel
 * it, then invite the address again: that's a new link.
 */

export type CancelOutcome =
  | { ok: true }
  /** The actor may no longer manage invites, or there's no such invite in the workspace. */
  | { ok: false; reason: "not-allowed" | "not-found" }
  /** Someone has already joined with it. */
  | { ok: false; reason: "accepted" };

export function cancelInvite(
  db: Database,
  actor: { userId: string; workspaceId: string },
  inviteId: string,
  now: number,
): Promise<CancelOutcome> {
  return db.transaction(async (tx): Promise<CancelOutcome> => {
    await lockMembers(tx, actor.workspaceId);
    const access = await actorAccess(tx, actor.userId, actor.workspaceId);
    if (!access || !can(access, "members.manage")) return { ok: false, reason: "not-allowed" };
    const open = await lockOpenWorkspace(tx, actor.workspaceId);
    if (!open) return { ok: false, reason: "not-found" };
    const { rows } = await tx.query<{ accepted: boolean; revoked: boolean }>(
      `SELECT accepted_at IS NOT NULL AS accepted, revoked_at IS NOT NULL AS revoked
       FROM workspace_invites WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
      [inviteId, actor.workspaceId],
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: "not-found" };
    if (row.accepted) return { ok: false, reason: "accepted" };
    if (row.revoked) return { ok: true };
    await tx.query("UPDATE workspace_invites SET revoked_at = $2 WHERE id = $1", [
      inviteId,
      toDate(now),
    ]);
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId: actor.workspaceId,
        action: "member.invite_cancelled",
        target: { type: "invite", id: inviteId },
        fields: ["revoked_at"],
      },
      now,
    );
    return { ok: true };
  });
}
