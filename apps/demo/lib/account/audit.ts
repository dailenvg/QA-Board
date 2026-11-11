import type { Queryable } from "../share/migrate";

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

/** One audit entry, by whoever did it: a user, or null for Squint itself (the daily cron). */
export interface AuditEntry {
  actorUserId: string | null;
  /** Set for a workspace's entries, so they outlive it (021: no foreign key). */
  workspaceId?: string | null;
  action: AccountAction | WorkspaceAction | MembershipAction;
  target: { type: "user" | "workspace"; id: string };
  /** The fields that changed: never a value, an email, a hash or a token. */
  fields: readonly string[];
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
      JSON.stringify({ fields: entry.fields }),
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
