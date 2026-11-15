import { audit } from "../../account/audit";
import type { MembershipRole } from "../../auth/memberships";
import { can, knownSwitches, type MemberSwitch } from "../../auth/permissions";
import type { Database } from "../../db/database";
import { actorAccess, lockMembers, lockOpenWorkspace } from "./locks";

/**
 * The owner sets what one member may do (4.10): their four switches at once.
 * The member's next request reads them (`findMembership`), so nothing needs
 * clearing. Turning `people` off leaves the invites they sent alone.
 */

export type SwitchesOutcome =
  | { ok: true; permissions: MemberSwitch[] }
  /** Only the owner changes switches. */
  | { ok: false; reason: "owner-only" }
  /** Not in the workspace (removed, or never), or the workspace has closed. */
  | { ok: false; reason: "not-found" }
  /** `owner`: the owner's own row, which has everything. `leaving`: they deleted their account. */
  | { ok: false; reason: "owner" | "leaving" };

interface TargetRow {
  role: MembershipRole;
  permissions: string[] | null;
  deleted: boolean;
}

function same(a: readonly MemberSwitch[], b: readonly MemberSwitch[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/**
 * Gives `targetId` exactly `switches`, in the members lock order: L1 (so a
 * removal or invite by that member waits, and then reads the new ones), the
 * owner's role again, L4, then the membership. Audits the change with the
 * switches before and after (names only); a change to the same switches
 * writes nothing.
 */
export function setMemberSwitches(
  db: Database,
  actor: { userId: string; workspaceId: string },
  targetId: string,
  switches: readonly MemberSwitch[],
  now: number,
): Promise<SwitchesOutcome> {
  const { workspaceId } = actor;
  const after = knownSwitches(switches);
  return db.transaction(async (tx): Promise<SwitchesOutcome> => {
    await lockMembers(tx, workspaceId);
    const access = await actorAccess(tx, actor.userId, workspaceId);
    if (!access || !can(access, "members.permissions")) return { ok: false, reason: "owner-only" };
    if (!(await lockOpenWorkspace(tx, workspaceId))) return { ok: false, reason: "not-found" };
    const { rows } = await tx.query<TargetRow>(
      `SELECT m.role, m.permissions, u.deleted_at IS NOT NULL AS deleted
       FROM memberships AS m JOIN users AS u ON u.id = m.user_id
       WHERE m.user_id = $1 AND m.workspace_id = $2`,
      [targetId, workspaceId],
    );
    const target = rows[0];
    if (!target) return { ok: false, reason: "not-found" };
    if (target.role === "owner") return { ok: false, reason: "owner" };
    if (target.deleted) return { ok: false, reason: "leaving" };
    const before = knownSwitches(target.permissions);
    if (same(before, after)) return { ok: true, permissions: after };
    await tx.query(
      `UPDATE memberships SET permissions = $3::text[]
       WHERE user_id = $1 AND workspace_id = $2 AND role = 'member'`,
      [targetId, workspaceId, after],
    );
    await audit(
      tx,
      {
        actorUserId: actor.userId,
        workspaceId,
        action: "membership.permissions_changed",
        target: { type: "user", id: targetId },
        fields: ["permissions"],
        meta: { before, after },
      },
      now,
    );
    return { ok: true, permissions: after };
  });
}
