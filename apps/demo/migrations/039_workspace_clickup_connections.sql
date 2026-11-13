-- A workspace's ClickUp connection: the owner pastes a ClickUp
-- personal API token in Workspace settings, and Squint keeps it to post to one ClickUp workspace
-- (a "team" in ClickUp's API) as the ClickUp user the token belongs to. One connection per
-- workspace (the primary key); connecting again replaces it.
--
-- `clickup_user_id`, `clickup_username`: whose token it is, as ClickUp named them when it was
-- checked, so the settings can say whose name posts appear under.
--
-- The token is sealed with AES-256-GCM before it gets here (lib/workspace/sealed-secrets.ts,
-- keyed from AUTH_SECRET, bound to the workspace), so the column alone can't be used. Personal
-- tokens don't expire; their owner can regenerate one in ClickUp, which ends this one. Deleting
-- the workspace deletes the connection; deleting the Squint user who connected it keeps it, with
-- nobody named.
--
-- A new table only: nothing existing changes. Safe to run more than once.

CREATE TABLE IF NOT EXISTS workspace_clickup_connections (
  workspace_id          uuid        PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  clickup_team_id       text        NOT NULL CHECK (char_length(clickup_team_id) BETWEEN 1 AND 64),
  clickup_team_name     text        NOT NULL CHECK (char_length(clickup_team_name) BETWEEN 1 AND 200),
  clickup_user_id       text        NOT NULL CHECK (char_length(clickup_user_id) BETWEEN 1 AND 64),
  clickup_username      text        NOT NULL CHECK (char_length(clickup_username) BETWEEN 1 AND 200),
  access_token_sealed   text        NOT NULL,
  connected_by          uuid        REFERENCES users (id) ON DELETE SET NULL,
  connected_at          timestamptz NOT NULL DEFAULT now()
);
