import type { MemberSwitch } from "../auth/permissions";
import type { Queryable } from "../share/migrate";
import type { ReviewWindowChoice } from "../share/review-window";
import type { ProjectStage } from "../store/types";

/** What the account settings record in the audit log. */
export type AccountAction =
  | "user.signed_in"
  | "user.signed_out"
  | "user.name_changed"
  | "user.password_changed"
  | "user.email_change_requested"
  | "user.email_changed"
  | "user.signed_out_everywhere"
  | "user.avatar_changed"
  | "user.avatar_removed"
  | "user.deletion_scheduled"
  | "user.restored"
  | "user.deleted"
  | "user.clickup_connected"
  | "user.clickup_disconnected";

/** What the workspace settings record in the audit log. */
export type WorkspaceAction =
  | "workspace.settings_changed"
  | "workspace.logo_changed"
  | "workspace.logo_removed"
  | "workspace.deletion_scheduled"
  | "workspace.restored"
  | "workspace.created"
  | "workspace.deleted";

/**
 * Who joined or left a workspace, or had their switches changed by the owner:
 * targets the user, with the workspace's id.
 */
export type MembershipAction =
  "membership.added" | "membership.removed" | "membership.permissions_changed";

/**
 * An invitation to join a workspace was made (or made again once expired),
 * sent again or cancelled: targets the invite, never its address.
 */
export type MemberInviteAction =
  "member.invited" | "member.invite_resent" | "member.invite_cancelled";

/**
 * What happens to a workspace's projects: the daily cron deleting an archived
 * one once its date came, a member sending one to ClickUp, or a member
 * changing its stage.
 */
export type ProjectAction = "project.deleted" | "project.clickup_sent" | "project.stage_changed";

/**
 * A member changed a project's review link settings or password, or emailed
 * its invitation: targets the project.
 */
export type ShareAction =
  "share.settings_changed" | "share.password_set" | "share.password_removed" | "share.invites_sent";

/**
 * What the Squint admin does to a workspace from the admin panel: the admin
 * is the actor, with the workspace's id. A new reset link targets the owner
 * it's for (never the link or its token); the rest target the workspace.
 */
export type AdminWorkspaceAction =
  | "admin.workspace_quota_changed"
  | "admin.owner_reset_link_created"
  | "admin.workspace_suspended"
  | "admin.workspace_unsuspended"
  | "admin.workspace_archived"
  | "admin.workspace_unarchived";

/**
 * What the Squint admin does to Squint as a whole: running the daily cleanup
 * from the Storage page. No workspace and no target; its counts are in
 * `cron_runs`, not the log.
 */
export type AdminSystemAction = "admin.sweep_run";

export type AdminAction = AdminWorkspaceAction | AdminSystemAction;

/** What `project.clickup_sent` keeps: the ClickUp workspace and channel ids, and whether it was assigned. */
export interface ClickUpSentMeta {
  clickUpTeamId: string;
  channelId: string;
  assigned: number;
}

/** One audit entry, by whoever did it: a user, or null for Squint itself (the daily cron). */
export interface AuditEntry {
  actorUserId: string | null;
  /** Set for a workspace's entries, so they outlive it (021: no foreign key). */
  workspaceId?: string | null;
  action:
    | AccountAction
    | WorkspaceAction
    | MembershipAction
    | MemberInviteAction
    | ProjectAction
    | ShareAction
    | AdminAction;
  /** What it was done to; null for the admin's actions on Squint as a whole. */
  target: { type: "user" | "workspace" | "project" | "invite"; id: string } | null;
  /** The fields that changed: never a value, an email, a hash or a token. */
  fields: readonly string[];
  /**
   * The only values an entry keeps besides the field names: a review link's
   * new window (a fixed choice), which link an invitation went out on and to
   * whom, as keyed HMACs of the addresses only (`share-invites.ts`), so the
   * Share window can count people without the log holding an address; or
   * which ClickUp channel a project went to, and whether it was assigned to
   * someone (never the message, a ClickUp user or the token); that a
   * membership came from accepting an invite; a member's switches before
   * and after the owner changed them (their names only); or a project's new
   * stage (a fixed choice, null for none).
   */
  meta?:
    | { reviewWindow: ReviewWindowChoice }
    | { stage: ProjectStage | null }
    | { source: "invite" }
    | { before: readonly MemberSwitch[]; after: readonly MemberSwitch[] }
    | { shareId: string; recipients: readonly string[] }
    | ClickUpSentMeta;
}

export async function audit(db: Queryable, entry: AuditEntry, now: number): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta, at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      entry.actorUserId,
      entry.workspaceId ?? null,
      entry.action,
      entry.target?.type ?? null,
      entry.target?.id ?? null,
      JSON.stringify({ fields: entry.fields, ...entry.meta }),
      new Date(now),
    ],
  );
}

/**
 * Records a change the user made to their own account. `meta` names the
 * fields only: never a value, an email, a hash or a token.
 */
export async function auditAccount(
  db: Queryable,
  userId: string,
  action: AccountAction,
  fields: readonly string[],
  now: number,
): Promise<void> {
  await audit(
    db,
    { actorUserId: userId, action, target: { type: "user", id: userId }, fields },
    now,
  );
}

/**
 * Records a change an owner made to their workspace. As with
 * `auditAccount`, `meta` names the fields only, never their values.
 */
export async function auditWorkspace(
  db: Queryable,
  { userId, workspaceId }: { userId: string; workspaceId: string },
  action: WorkspaceAction,
  fields: readonly string[],
  now: number,
): Promise<void> {
  const target = { type: "workspace", id: workspaceId } as const;
  await audit(db, { actorUserId: userId, workspaceId, action, target, fields }, now);
}

/**
 * Records what the Squint admin did to a workspace from the admin panel.
 * As with `auditAccount`, `meta` names the fields only, never their values.
 */
export async function auditAdmin(
  db: Queryable,
  { adminId, workspaceId }: { adminId: string; workspaceId: string },
  action: Exclude<AdminWorkspaceAction, "admin.owner_reset_link_created">,
  fields: readonly string[],
  now: number,
): Promise<void> {
  const target = { type: "workspace", id: workspaceId } as const;
  await audit(db, { actorUserId: adminId, workspaceId, action, target, fields }, now);
}

/**
 * Records what the Squint admin did to Squint as a whole: no workspace, no
 * target, and `fields` names only.
 */
export async function auditAdminSystem(
  db: Queryable,
  adminId: string,
  action: AdminSystemAction,
  fields: readonly string[],
  now: number,
): Promise<void> {
  await audit(db, { actorUserId: adminId, action, target: null, fields }, now);
}
