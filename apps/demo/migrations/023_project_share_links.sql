-- A workspace project's review link: which share (squint_shares) it pushes to, and the share's
-- token and owner key, so any browser signed in to the workspace can copy the link and sync.
-- Both secrets are sealed with AES-256-GCM before they get here (lib/workspace/sealed-secrets.ts,
-- keyed from AUTH_SECRET); squint_shares itself still keeps only their hashes. One link per
-- project. The share must be the same workspace's share of the same project (the composite
-- foreign key, over a unique index squint_shares already satisfies through its primary key), so
-- revoking the share or deleting the project removes the link. `cursor` is the owner's pull
-- position (squint_share_seq). Safe to run more than once.

CREATE UNIQUE INDEX IF NOT EXISTS squint_shares_owner_idx
  ON squint_shares (id, workspace_id, project_id);

CREATE TABLE IF NOT EXISTS project_share_links (
  workspace_id      uuid        NOT NULL,
  project_id        text        NOT NULL,
  share_id          text        NOT NULL UNIQUE,
  token_sealed      text        NOT NULL,
  owner_key_sealed  text        NOT NULL,
  cursor            bigint      NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_synced_at    timestamptz,
  PRIMARY KEY (workspace_id, project_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (share_id, workspace_id, project_id)
    REFERENCES squint_shares (id, workspace_id, project_id) ON DELETE CASCADE
);
