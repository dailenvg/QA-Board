-- A workspace's projects, from the browser store's `Project`. Ids are the browser's random
-- UUIDs, unique on their own, so pages, snapshots and comments key on `project_id`; the extra
-- unique (workspace_id, id) lets tables that also carry `workspace_id` reference a project in
-- the same workspace only. `source` is the browser's `ProjectSource` (a website URL, or pages),
-- validated by its zod schema before it's written. Safe to run more than once.

CREATE TABLE IF NOT EXISTS projects (
  id            text        PRIMARY KEY,
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  folder_id     text        NOT NULL,
  name          text        NOT NULL CHECK (btrim(name) <> ''),
  source        jsonb       NOT NULL,
  label         text,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, folder_id) REFERENCES folders (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS projects_folder_idx ON projects (workspace_id, folder_id);
