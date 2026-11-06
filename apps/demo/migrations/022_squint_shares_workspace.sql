-- Shares made from a workspace: `workspace_id` (and the project it shares, and who invited the
-- reviewers) on squint_shares. Shares made before this, or without signing in, keep all three
-- null and work as before. Only those anonymous shares still delete themselves 30 days after
-- their project was created, so `expires_at` may now be null, but never on an anonymous share
-- (the CHECK), and has no default: every insert since 007 sends it. The daily expiry reads
-- anonymous shares only (the partial index replaces 007's). A share's project must be in its
-- workspace (the composite foreign key, with the CHECK because a null workspace_id would skip
-- it). Times on these tables stay epoch ms (bigint). Safe to run more than once.

ALTER TABLE squint_shares
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces (id) ON DELETE CASCADE;
ALTER TABLE squint_shares
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS project_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'squint_shares_project_fkey') THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_project_fkey
      FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'squint_shares_project_in_workspace') THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_project_in_workspace
      CHECK (project_id IS NULL OR workspace_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'squint_shares_anonymous_expire') THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_anonymous_expire
      CHECK (workspace_id IS NOT NULL OR expires_at IS NOT NULL);
  END IF;
END;
$$;

ALTER TABLE squint_shares ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE squint_shares ALTER COLUMN expires_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS squint_shares_anonymous_expires_at_idx
  ON squint_shares (expires_at) WHERE workspace_id IS NULL;
DROP INDEX IF EXISTS squint_shares_expires_at_idx;

CREATE INDEX IF NOT EXISTS squint_shares_workspace_idx
  ON squint_shares (workspace_id) WHERE workspace_id IS NOT NULL;
