-- Deleting a project moves it to the trash (`deleted_at`) instead of deleting its rows: every
-- workspace read skips it, its share stops answering, and Restore brings it back. The daily
-- cron (/api/cron/expire) deletes it for good once the grace period has passed, with its
-- pages, snapshots, comments and files; the partial index is what that cron reads.
-- Safe to run more than once.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_deleted_at_idx
  ON projects (deleted_at) WHERE deleted_at IS NOT NULL;
