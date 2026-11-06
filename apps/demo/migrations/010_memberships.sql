-- Who belongs to which workspace. Phase 1: exactly one owner per workspace (the partial unique
-- index), no members yet; Phase 2 adds members without changing this table. Every workspace
-- query checks the signed-in user's row here first. Safe to run more than once.

CREATE TABLE IF NOT EXISTS memberships (
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('owner', 'member')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS memberships_workspace_idx ON memberships (workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_owner_idx
  ON memberships (workspace_id) WHERE role = 'owner';
