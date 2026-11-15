-- Sets how many people a workspace holds (043's `seat_limit`: its owner, its members and its open
-- invites), until the admin panel (M4) does this. Paste into the Neon SQL editor, fill in the two
-- values below between their quotes, and run it.
--
-- The limit is 1 to 100. Lowering it below the seats in use removes nobody: invites are refused,
-- and nobody new can join, until enough seats are free again.
--
-- It returns the workspace's slug with its old and new limit, and records the change in the audit
-- log. No rows means no workspace has that slug. A limit outside 1 to 100, or not a whole number,
-- fails with "violates check constraint" or "invalid input syntax" and changes nothing: fix the
-- value and run it again.

WITH input (slug, seat_limit) AS (
  VALUES (
    'workspace-slug', -- 1. The workspace's slug, as its settings page shows it.
    '10'              -- 2. Its new seat limit: a whole number from 1 to 100.
  )
), old AS (
  SELECT w.id, w.seat_limit FROM workspaces AS w, input
  WHERE w.slug = lower(btrim(input.slug))
  FOR UPDATE OF w
), changed AS (
  UPDATE workspaces AS w SET seat_limit = btrim(input.seat_limit)::integer
  FROM input, old
  WHERE w.id = old.id
  RETURNING w.id, w.slug, w.seat_limit
), logged AS (
  INSERT INTO audit_log (actor_user_id, workspace_id, action, target_type, target_id, meta)
  SELECT NULL::uuid, id, 'workspace.settings_changed', 'workspace', id::text,
    '{"fields":["seat_limit"]}'::jsonb
  FROM changed
)
SELECT changed.slug, old.seat_limit AS old_limit, changed.seat_limit AS new_limit
FROM changed JOIN old USING (id);
