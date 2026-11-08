import type { Queryable } from "../share/migrate";

/** What the account settings record in the audit log. */
export type AccountAction =
  | "user.name_changed"
  | "user.password_changed"
  | "user.email_change_requested"
  | "user.email_changed"
  | "user.signed_out_everywhere"
  | "user.avatar_changed"
  | "user.avatar_removed";

/** What the workspace settings record in the audit log. */
export type WorkspaceAction =
  "workspace.settings_changed" | "workspace.logo_changed" | "workspace.logo_removed";

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
  await db.query(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, meta, at)
     VALUES ($1, $2, 'user', $3, $4::jsonb, $5)`,
    [userId, action, userId, JSON.stringify({ fields }), new Date(now)],
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
  await db.query(
    `INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta, at)
     VALUES ($1, $2, $3, 'workspace', $4, $5::jsonb, $6)`,
    [userId, workspaceId, action, workspaceId, JSON.stringify({ fields }), new Date(now)],
  );
}
