-- A workspace's folders, from the browser store's `Folder`. Ids come from the browser (imported
-- data keeps them, and older browsers have a folder named `default`), so they're unique per
-- workspace only: the key is (workspace_id, id), and a parent must be in the same workspace.
-- Deleting a folder deletes what's inside it, as in the browser. Safe to run more than once.

CREATE TABLE IF NOT EXISTS folders (
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  id            text        NOT NULL,
  parent_id     text,
  name          text        NOT NULL CHECK (btrim(name) <> ''),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES folders (workspace_id, id) ON DELETE CASCADE,
  CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders (workspace_id, parent_id);
