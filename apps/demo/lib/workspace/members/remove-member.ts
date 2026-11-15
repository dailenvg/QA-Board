import { endSignIns, REMOVAL_GRACE_MS, SIGN_IN_TABLES } from "../../account/account-deletion";
import { audit } from "../../account/audit";
import type { MembershipRole } from "../../auth/memberships";
import { can, knownSwitches } from "../../auth/permissions";
import type { Database } from "../../db/database";
import type { Queryable } from "../../share/migrate";
import { toDate } from "../times";
import { actorAccess, lockMembers, lockOpenWorkspace } from "./locks";

/**
 * Removing someone from a workspace (4.5): the owner removes any member, and
 * a member with the people switch removes members without it (D1), never
 * themself and never the owner. They're signed out at once and lose the
 * workspace and their ClickUp connection; their account is deleted after
 * `REMOVAL_GRACE_MS` (decision 7), and until then an invite from this
 * workspace revives it with no more than the switches it had (044's
 * `removed_from`, `removed_permissions`). Not undoable: delaying it would keep
 * their access alive.
 */

export type RemoveOutcome =
  | { ok: true }
  /**
   * `not-allowed`: the actor may no longer remove people. `protected`: not
   * this person (themself, or another member with the people switch, D1).
   * `owner-only`: the person is the owner, whom nobody removes.
   */
  | { ok: false; reason: "not-allowed" | "protected" | "owner-only" }
  /** Not in the workspace (already removed, or never), or the workspace has closed. */
  | { ok: false; reason: "not-found" }
  /** They deleted their own account first: already leaving (I7). */
  | { ok: false; reason: "leaving" };

interface Target {
  role: MembershipRole;
  permissions: string[] | null;
}

/**
 * Removes `targetId` from the actor's workspace, in one transaction, in the
 * members lock order: L1; the actor's role and switches again; L2, the
 * removed user's row; L4, the workspace while it's open; then their
 * membership, read again for D1. Whichever of this and their own deletion
 * commits second sees the other: this answers `leaving`, theirs finds the
 * account already deleted.
 */
export function removeMember(
  db: Database,
  actor: { userId: string; workspaceId: string },
  targetId: string,
  now: number,
): Promise<RemoveOutcome> {
  const { workspaceId } = actor;
  return db.transaction(async (tx): Promise<RemoveOutcome> => {
    await lockMembers(tx, workspaceId);
    const access = await actorAccess(tx, actor.userId, workspaceId);
    if (!access || !can(access, "members.manage")) return { ok: false, reason: "not-allowed" };
    const { rows: users } = await tx.query<{ deleted: boolean }>(
      "SELECT deleted_at IS NOT NULL AS deleted FROM users WHERE id = $1 FOR UPDATE",
      [targetId],
    );
    const user = users[0];
    if (!user || !(await lockOpenWorkspace(tx, workspaceId))) {
      return { ok: false, reason: "not-found" };
    }
    const { rows: memberships } = await tx.query<Target>(
      "SELECT role, permissions FROM memberships WHERE user_id = $1 AND workspace_id = $2",
      [targetId, workspaceId],
    );
    const target = memberships[0];
    if (!target) return { ok: false, reason: "not-found" };
    if (target.role === "owner") return { ok: false, reason: "owner-only" };
    if (targetId === actor.userId) return { ok: false, reason: "protected" };
    if (access.role !== "owner" && knownSwitches(target.permissions).includes("people")) {
      return { ok: false, reason: "protected" };
    }
    if (user.deleted) return { ok: false, reason: "leaving" };
    await takeOut(tx, { userId: targetId, workspaceId, switches: target.permissions }, now);
    const subject = { type: "user", id: targetId } as const;
    const by = { actorUserId: actor.userId, workspaceId, target: subject };
    await audit(
      tx,
      { ...by, action: "membership.removed", fields: ["membership", "clickup"] },
      now,
    );
    await audit(
      tx,
      {
        ...by,
        action: "user.deletion_scheduled",
        fields: [
          "deleted_at",
          "delete_after",
          "removed_from",
          "removed_permissions",
          ...SIGN_IN_TABLES,
        ],
      },
      now,
    );
    return { ok: true };
  });
}

/**
 * The removal's writes: the membership (its ClickUp connection goes with it,
 * 040's key) and the workspace's ClickUp connection from before 040 if they
 * made it; then the account, deleted with the removal's grace, remembering
 * where from and with which switches; then every way back in.
 */
async function takeOut(
  tx: Queryable,
  {
    userId,
    workspaceId,
    switches,
  }: { userId: string; workspaceId: string; switches: string[] | null },
  now: number,
): Promise<void> {
  await tx.query("DELETE FROM memberships WHERE user_id = $1 AND workspace_id = $2", [
    userId,
    workspaceId,
  ]);
  await tx.query(
    "DELETE FROM workspace_clickup_connections WHERE workspace_id = $1 AND connected_by = $2",
    [workspaceId, userId],
  );
  await tx.query(
    `UPDATE users SET deleted_at = $2, delete_after = $3, removed_from = $4,
       removed_permissions = $5::text[]
     WHERE id = $1`,
    [userId, toDate(now), toDate(now + REMOVAL_GRACE_MS), workspaceId, knownSwitches(switches)],
  );
  await endSignIns(tx, userId);
}
