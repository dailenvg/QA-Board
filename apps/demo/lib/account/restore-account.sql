-- Restores an account deleted from /account/profile, before its permanent deletion date, until the
-- admin panel (M4) does this. The same as `restoreAccount` in account-deletion.ts, by email.
-- Paste into the Neon SQL editor, fill in the three values below between their quotes, and run it.
-- The person signs in with the password they had.
--
-- An owner gets back the workspace they owned alone, with its share links. A member gets back the
-- workspace they were in. But if that workspace is waiting to be deleted too (its owner deleted
-- their account since), the member gets a new, empty workspace instead, named by values 2 and 3,
-- and leaves the old one, which is still deleted on its date. In every other case, leave values 2
-- and 3 empty: they are ignored.
--
-- It returns one row per change. No rows means nothing was restored (unknown email, never
-- deleted, or already deleted for good), so running it again is safe. If a new workspace is needed
-- and value 2 or 3 is empty or not valid, it fails with "violates check constraint". If another
-- workspace has that slug, it fails with "duplicate key". Either way nothing changes: fix the
-- value and run it again.

WITH input (email, workspace_name, workspace_slug) AS (
  VALUES (
    'person@example.com', -- 1. The account's email.
    '',                   -- 2. Name of the new workspace: up to 80 characters; write ' as ''.
    ''                    -- 3. Its slug: lowercase letters, digits and single hyphens, up to 48.
  )
), account AS (
  UPDATE users SET deleted_at = NULL, delete_after = NULL
  FROM input
  WHERE users.email = lower(btrim(input.email)) AND users.delete_after > now()
  RETURNING users.id
), workspace AS (
  UPDATE workspaces AS w SET delete_after = NULL
  FROM memberships AS m, account
  WHERE m.user_id = account.id AND m.workspace_id = w.id AND m.role = 'owner'
    AND w.delete_after > now()
  RETURNING w.id
), left_workspace AS (
  DELETE FROM memberships AS m
  USING account, workspaces AS w
  WHERE m.user_id = account.id AND m.workspace_id = w.id AND m.role = 'member'
    AND w.delete_after IS NOT NULL
  RETURNING m.user_id, m.workspace_id
), new_workspace AS (
  INSERT INTO workspaces (slug, name)
  SELECT btrim(workspace_slug), btrim(workspace_name) FROM input
  WHERE EXISTS (SELECT 1 FROM left_workspace)
  RETURNING id
), new_owner AS (
  INSERT INTO memberships (user_id, workspace_id, role)
  SELECT account.id, new_workspace.id, 'owner' FROM account, new_workspace
  RETURNING user_id, workspace_id
)
INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta)
SELECT NULL::uuid, NULL::uuid, 'user.restored', 'user', id::text,
  '{"fields":["deleted_at","delete_after"]}'::jsonb
FROM account
UNION ALL
SELECT NULL::uuid, id, 'workspace.restored', 'workspace', id::text, '{"fields":["delete_after"]}'::jsonb
FROM workspace
UNION ALL
SELECT NULL::uuid, id, 'workspace.created', 'workspace', id::text, '{"fields":["workspace"]}'::jsonb
FROM new_workspace
UNION ALL
SELECT NULL::uuid, workspace_id, 'membership.added', 'user', user_id::text,
  '{"fields":["membership"]}'::jsonb
FROM new_owner
UNION ALL
SELECT NULL::uuid, workspace_id, 'membership.removed', 'user', user_id::text,
  '{"fields":["membership"]}'::jsonb
FROM left_workspace
RETURNING action, target_id;
