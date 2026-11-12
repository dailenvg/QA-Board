import type { Queryable } from "../share/migrate";
import type { ReviewWindowChoice } from "../share/review-window";

/** What the account settings record in the audit log. */
export type AccountAction =
  | "user.name_changed"
  | "user.password_changed"
  | "user.email_change_requested"
  | "user.email_changed"
  | "user.signed_out_everywhere"
  | "user.avatar_changed"
  | "user.avatar_removed"
  | "user.deletion_scheduled"
  | "user.restored"
  | "user.deleted";

/** What the workspace settings record in the audit log. */
export type WorkspaceAction =
  | "workspace.settings_changed"
  | "workspace.logo_changed"
  | "workspace.logo_removed"
  | "workspace.deletion_scheduled"
  | "workspace.restored"
  | "workspace.created"
  | "workspace.deleted";

/** Who joined or left a workspace: targets the user, with the workspace's id. */
export type MembershipAction = "membership.added" | "membership.removed";

/** What the daily cron does to a workspace's projects: an archived one deleted once its date came. */
export type ProjectAction = "project.deleted";

/** A member changed a project's review link settings or password: targets the project. */
export type ShareAction =
  "share.settings_changed" | "share.password_set" | "share.password_removed";

/** One audit entry, by whoever did it: a user, or null for Squint itself (the daily cron). */
export interface AuditEntry {
  actorUserId: string | null;
  /** Set for a workspace's entries, so they outlive it (021: no foreign key). */
  workspaceId?: string | null;
  action: AccountAction | WorkspaceAction | MembershipAction | ProjectAction | ShareAction;
  target: { type: "user" | "workspace" | "project"; id: string };
  /** The fields that changed: never a value, an email, a hash or a token. */
  fields: readonly string[];
  /**
   * The only values an entry keeps besides the field names, each a fixed
   * choice that says nothing about anyone: a review link's new window.
   */
  meta?: { reviewWindow: ReviewWindowChoice };
}

export async function audit(db: Queryable, entry: AuditEntry, now: number): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta, at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      entry.actorUserId,
      entry.workspaceId ?? null,
      entry.action,
      entry.target.type,
      entry.target.id,
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
