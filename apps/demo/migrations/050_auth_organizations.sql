-- Better Auth's organization plugin reads workspaces and memberships (Milestone 4a, PR 3), mapped
-- column by column (lib/auth/better-auth.ts), rather than tables of its own.
--
-- `memberships` gains an `id` of its own, as Better Auth's member model needs; (user_id,
-- workspace_id) stays the primary key. `sessions` gains `active_organization_id`, which the
-- plugin reads with every session; Squint never sets it, so it stays null. `workspaces` gains
-- `metadata`, which the plugin's organization model reads; also unused. A deploy from before
-- this migration ignores all three: the defaults fill them on its inserts.
--
-- Then 049's copy of open `password_resets` rows into `verifications`, once more: a deploy from
-- before 049 kept writing `password_resets` until the new one took over, so a link emailed in
-- that window still works. Only rows written after 049 ran (with a minute's slack for one still
-- committing as it ran), none already in `verifications`, and none from before the user's
-- password was last reset or changed or their email changed: a link 049 copied and Better Auth
-- has since used or voided is gone from `verifications` but still unused in `password_resets`,
-- and must not come back.
--
-- `memberships.id`'s random default rewrites `memberships`, a small table; the other two are
-- nullable with no default and rewrite nothing. Safe to run more than once.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_organization_id uuid;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS metadata text;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_id_idx ON memberships (id);

INSERT INTO verifications (identifier, value, expires_at, created_at, updated_at, by_admin)
SELECT 'sha256:reset-password:' || r.token_hash, r.user_id::text, r.expires_at, r.created_at,
  r.created_at, r.by_admin
FROM password_resets AS r
WHERE r.used_at IS NULL AND r.expires_at > now()
  AND r.created_at > (
    SELECT m.applied_at - interval '1 minute' FROM squint_migrations AS m
    WHERE m.id = '049_auth_verifications'
  )
  AND NOT EXISTS (
    SELECT 1 FROM verifications AS v WHERE v.identifier = 'sha256:reset-password:' || r.token_hash
  )
  AND NOT EXISTS (
    SELECT 1 FROM audit_log AS a
    WHERE a.target_type = 'user' AND a.target_id = r.user_id::text AND a.at >= r.created_at
      AND a.action IN ('user.password_reset', 'user.password_changed', 'user.email_changed')
  );
