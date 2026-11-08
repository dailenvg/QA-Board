import type { Queryable } from "../share/migrate";

/** What the account settings record in the audit log. */
export type AccountAction =
  | "user.name_changed"
  | "user.password_changed"
  | "user.email_change_requested"
  | "user.email_changed"
  | "user.signed_out_everywhere";

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
