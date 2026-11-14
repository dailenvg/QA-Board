-- Each member's own ClickUp connection: ClickUp moves from the workspace (039, one per workspace,
-- the owner's) to the people who use it. Any member pastes their own ClickUp personal API token
-- in their profile settings, and "Send to ClickUp" posts as them. One connection per member per
-- workspace (the primary key); connecting again replaces it.
--
-- Same columns as 039, without `connected_by` (the row is its user's). The composite key into
-- `memberships` means a member who leaves the workspace, or whose account is deleted for good
-- (the purge deletes their memberships and keeps a scrubbed `users` row), loses their connection
-- with it, as does a deleted workspace. While an account or workspace waits out its 30 days
-- (033), nothing is deleted, so restoring it brings the connection back.
--
-- `access_token_sealed`: AES-256-GCM (lib/workspace/sealed-secrets.ts), keyed from AUTH_SECRET
-- and bound to the workspace and the user, so one member's sealed token can't be opened as
-- another's. `sealed_for` says which binding a row has: 'user' for everything the app writes;
-- 'workspace' for a token copied below from 039, which was sealed to its workspace alone and
-- which SQL can't re-seal. The app opens a 'workspace' row with 039's binding only while 039
-- still has that token as its connector's, and on that first use re-seals it to the user
-- (setting 'user') and deletes the 039 row.
--
-- The copy: each 039 connection whose connector is still a member of its workspace becomes
-- theirs. One connected by an account since deleted has nobody to move to and isn't copied.
-- 039 stays, unused from here on (a later cleanup removes it): the app deletes a member's 039
-- row once their copy is re-sealed, or when they connect again or disconnect, so no second
-- copy of their token lingers.
--
-- A new table and a copy into it: nothing existing changes. Safe to run more than once (a row
-- already there is kept).

CREATE TABLE IF NOT EXISTS user_clickup_connections (
  user_id               uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id          uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  clickup_team_id       text        NOT NULL CHECK (char_length(clickup_team_id) BETWEEN 1 AND 64),
  clickup_team_name     text        NOT NULL CHECK (char_length(clickup_team_name) BETWEEN 1 AND 200),
  clickup_user_id       text        NOT NULL CHECK (char_length(clickup_user_id) BETWEEN 1 AND 64),
  clickup_username      text        NOT NULL CHECK (char_length(clickup_username) BETWEEN 1 AND 200),
  access_token_sealed   text        NOT NULL,
  sealed_for            text        NOT NULL DEFAULT 'user' CHECK (sealed_for IN ('user', 'workspace')),
  connected_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id),
  FOREIGN KEY (user_id, workspace_id)
    REFERENCES memberships (user_id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_clickup_connections_workspace_idx
  ON user_clickup_connections (workspace_id);

INSERT INTO user_clickup_connections
  (user_id, workspace_id, clickup_team_id, clickup_team_name, clickup_user_id, clickup_username,
   access_token_sealed, sealed_for, connected_at)
SELECT legacy.connected_by, legacy.workspace_id, legacy.clickup_team_id, legacy.clickup_team_name,
  legacy.clickup_user_id, legacy.clickup_username, legacy.access_token_sealed, 'workspace',
  legacy.connected_at
FROM workspace_clickup_connections AS legacy
JOIN memberships AS member
  ON member.user_id = legacy.connected_by AND member.workspace_id = legacy.workspace_id
ON CONFLICT (user_id, workspace_id) DO NOTHING;
