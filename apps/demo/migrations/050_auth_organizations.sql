-- Better Auth's organization plugin reads workspaces and memberships (Milestone 4a, PR 3), mapped
-- column by column (lib/auth/better-auth.ts), rather than tables of its own.
--
-- `memberships` gains an `id` of its own, as Better Auth's member model needs; (user_id,
-- workspace_id) stays the primary key. `sessions` gains `active_organization_id`, which the
-- plugin reads with every session; Squint never sets it, so it stays null. `workspaces` gains
-- `metadata`, which the plugin's organization model reads; also unused. A deploy from before
-- this migration ignores all three: the defaults fill them on its inserts.
--
-- `memberships.id`'s random default rewrites `memberships`, a small table; the other two are
-- nullable with no default and rewrite nothing. Safe to run more than once.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_organization_id uuid;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS metadata text;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_id_idx ON memberships (id);
