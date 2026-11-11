-- Restores an account deleted from /account/profile while it can still be restored (before its
-- permanent deletion date), with the workspace it owned alone, until the admin panel (M4) does
-- this. The same as `restoreAccount` in account-deletion.ts, by email. Paste into the Neon SQL
-- editor, put the account's email where it says person@example.com, and run it. It answers one
-- row per thing restored; no rows means nothing could be (unknown email, never deleted, or
-- already deleted for good). The person signs in with the password they had.

WITH account AS (
  UPDATE users SET deleted_at = NULL, delete_after = NULL
  WHERE email = lower(btrim('person@example.com')) AND delete_after > now()
  RETURNING id
), workspace AS (
  UPDATE workspaces AS w SET delete_after = NULL
  FROM memberships AS m, account
  WHERE m.user_id = account.id AND m.workspace_id = w.id AND m.role = 'owner'
    AND w.delete_after > now()
  RETURNING w.id
)
INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta)
SELECT NULL::uuid, NULL::uuid, 'user.restored', 'user', id::text,
  '{"fields":["deleted_at","delete_after"]}'::jsonb
FROM account
UNION ALL
SELECT NULL::uuid, id, 'workspace.restored', 'workspace', id::text, '{"fields":["delete_after"]}'::jsonb
FROM workspace
RETURNING action, target_id;
