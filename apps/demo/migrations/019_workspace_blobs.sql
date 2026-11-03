-- Every file a workspace keeps in Vercel Blob (page images, snapshots, crops, its logo), keyed
-- `ws/<workspaceId>/...`. The row records what's stored and how big it is; storage_usage (020)
-- is kept from these rows by triggers. A deleted project leaves its rows (project_id becomes
-- null) so a cleanup job can still find and delete the files; deleting a workspace deletes the
-- rows, so the job that deletes a workspace removes its files first. Safe to run more than once.

CREATE TABLE IF NOT EXISTS workspace_blobs (
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  key           text        NOT NULL,
  project_id    text,
  content_type  text        NOT NULL,
  size          bigint      NOT NULL CHECK (size >= 0),
  blob_url      text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
    ON DELETE SET NULL (project_id)
);

CREATE INDEX IF NOT EXISTS workspace_blobs_project_idx ON workspace_blobs (project_id);
