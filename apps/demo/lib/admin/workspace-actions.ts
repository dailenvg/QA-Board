import { audit, auditAdmin } from "../account/audit";
import { openWorkspace } from "../auth/memberships";
import { createResetLink, type ResetLink } from "../auth/password-reset";
import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { toDate } from "../workspace/times";

/**
 * What the Squint admin does to a workspace from the admin panel. Each one
 * runs in a transaction that locks the workspace's row first, so a members
 * operation (`lockOpenWorkspace`, FOR SHARE) waits for it or it for them, and
 * records an audit entry with the admin as the actor: field names only, never
 * a value, a link or a token. Doing what's already done (suspending a
 * suspended workspace) changes nothing and records nothing.
 */

/** The admin acting, and the workspace acted on. */
export interface AdminTarget {
  adminId: string;
  workspaceId: string;
}

export type AdminActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: "not-found" }
  /** Archiving a workspace its owner scheduled for deletion (033): refused, see `archiveWorkspace`. */
  | { ok: false; reason: "deleting" };

interface LockedWorkspace {
  storage_quota_bytes: string | number;
  suspended_at: Date | null;
  archived_at: Date | null;
  delete_after: Date | null;
}

/** The workspace's row, `FOR UPDATE`; null when there's none. */
async function lockWorkspace(tx: Queryable, workspaceId: string): Promise<LockedWorkspace | null> {
  const { rows } = await tx.query<LockedWorkspace>(
    `SELECT storage_quota_bytes, suspended_at, archived_at, delete_after FROM workspaces
     WHERE id = $1 FOR UPDATE`,
    [workspaceId],
  );
  return rows[0] ?? null;
}

/**
 * Sets the workspace's storage quota to `quotaBytes` (bounds checked by the
 * route). Below what it already stores is allowed: uploads stop until it's
 * under again, and nothing is deleted.
 */
export function setWorkspaceQuota(
  db: Database,
  target: AdminTarget,
  quotaBytes: number,
  now: number,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, target.workspaceId);
    if (!workspace) return { ok: false, reason: "not-found" };
    if (Number(workspace.storage_quota_bytes) === quotaBytes) return { ok: true };
    await tx.query("UPDATE workspaces SET storage_quota_bytes = $2 WHERE id = $1", [
      target.workspaceId,
      quotaBytes,
    ]);
    await auditAdmin(tx, target, "admin.workspace_quota_changed", ["storage_quota_bytes"], now);
    return { ok: true };
  });
}

/**
 * Ends the sessions of the workspace's people who have no open workspace
 * left (`openWorkspace`, read after the suspension): they can't sign in
 * again until it's lifted. Anyone who still has another keeps their
 * sessions, and only that one opens. The admin belongs to no workspace, so
 * never. Returns how many sessions ended.
 */
async function endHeldSessions(tx: Queryable, workspaceId: string): Promise<number> {
  const { rows } = await tx.query(
    `DELETE FROM sessions WHERE user_id IN (
       SELECT m.user_id FROM memberships AS m JOIN users AS u ON u.id = m.user_id
       WHERE m.workspace_id = $1 AND u.role = 'company'
         AND NOT EXISTS (
           SELECT 1 FROM memberships AS other JOIN workspaces AS w ON w.id = other.workspace_id
           WHERE other.user_id = m.user_id AND ${openWorkspace("w")}
         )
     )
     RETURNING user_id`,
    [workspaceId],
  );
  return rows.length;
}

/**
 * Suspends the workspace (decision 1): it closes like an archived one
 * (`openWorkspace`), its review links pause (`SHARE_ANSWERS`), and its people
 * with no other open workspace are signed out and can't sign in
 * (`endHeldSessions`, `SignInCandidate.suspended`). Everything is kept.
 */
export function suspendWorkspace(
  db: Database,
  target: AdminTarget,
  now: number,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, target.workspaceId);
    if (!workspace) return { ok: false, reason: "not-found" };
    if (workspace.suspended_at) return { ok: true };
    await tx.query("UPDATE workspaces SET suspended_at = $2 WHERE id = $1", [
      target.workspaceId,
      toDate(now),
    ]);
    const ended = await endHeldSessions(tx, target.workspaceId);
    const fields = ["suspended_at", ...(ended > 0 ? ["sessions"] : [])];
    await auditAdmin(tx, target, "admin.workspace_suspended", fields, now);
    return { ok: true };
  });
}

/** Lifts a suspension: the workspace, its links and its people's sign-in work again. */
export function unsuspendWorkspace(
  db: Database,
  target: AdminTarget,
  now: number,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, target.workspaceId);
    if (!workspace) return { ok: false, reason: "not-found" };
    if (!workspace.suspended_at) return { ok: true };
    await tx.query("UPDATE workspaces SET suspended_at = NULL WHERE id = $1", [target.workspaceId]);
    await auditAdmin(tx, target, "admin.workspace_unsuspended", ["suspended_at"], now);
    return { ok: true };
  });
}

/**
 * Archives the workspace (decision 3): `archived_at` closes it
 * (`openWorkspace`, `SHARE_ANSWERS`) and keeps everything. Unlike an owner's
 * account deletion it schedules nothing: no cron touches an archived
 * workspace, and unarchiving opens it again as it was. A workspace its owner
 * scheduled for deletion is refused (`deleting`): archiving it would promise
 * "no deletion is scheduled" over the owner's own request, which stands. The
 * reverse can't happen: an owner can only schedule deletion of an open
 * workspace (`findOwnWorkspace`), checked again under this same row lock.
 */
export function archiveWorkspace(
  db: Database,
  target: AdminTarget,
  now: number,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, target.workspaceId);
    if (!workspace) return { ok: false, reason: "not-found" };
    if (workspace.archived_at) return { ok: true };
    if (workspace.delete_after) return { ok: false, reason: "deleting" };
    await tx.query("UPDATE workspaces SET archived_at = $2 WHERE id = $1", [
      target.workspaceId,
      toDate(now),
    ]);
    await auditAdmin(tx, target, "admin.workspace_archived", ["archived_at"], now);
    return { ok: true };
  });
}

export function unarchiveWorkspace(
  db: Database,
  target: AdminTarget,
  now: number,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspace(tx, target.workspaceId);
    if (!workspace) return { ok: false, reason: "not-found" };
    if (!workspace.archived_at) return { ok: true };
    await tx.query("UPDATE workspaces SET archived_at = NULL WHERE id = $1", [target.workspaceId]);
    await auditAdmin(tx, target, "admin.workspace_unarchived", ["archived_at"], now);
    return { ok: true };
  });
}

export type OwnerResetLinkResult =
  | ({ ok: true } & ResetLink)
  /** No such workspace; or its owner's account is deleted (or it has none), so no link. */
  | { ok: false; reason: "not-found" | "no-owner" };

/**
 * A password reset link for the workspace's owner (decision 2), to be shown
 * to the admin once and passed on by them: no email goes out. It works for
 * an hour, once (`createResetLink`). The audit entry targets the owner and
 * names the field only, never the link.
 */
export function createOwnerResetLink(
  db: Database,
  target: AdminTarget,
  { now, origin }: { now: number; origin: URL },
): Promise<OwnerResetLinkResult> {
  return db.transaction(async (tx) => {
    if (!(await lockWorkspace(tx, target.workspaceId))) return { ok: false, reason: "not-found" };
    const { rows } = await tx.query<{ id: string }>(
      `SELECT u.id FROM memberships AS m JOIN users AS u ON u.id = m.user_id
       WHERE m.workspace_id = $1 AND m.role = 'owner' AND u.deleted_at IS NULL`,
      [target.workspaceId],
    );
    const ownerId = rows[0]?.id;
    if (!ownerId) return { ok: false, reason: "no-owner" };
    const link = await createResetLink(tx, ownerId, { now, origin });
    if (!link) return { ok: false, reason: "no-owner" };
    await audit(
      tx,
      {
        actorUserId: target.adminId,
        workspaceId: target.workspaceId,
        action: "admin.owner_reset_link_created",
        target: { type: "user", id: ownerId },
        fields: ["password_resets"],
      },
      now,
    );
    return { ok: true, ...link };
  });
}
