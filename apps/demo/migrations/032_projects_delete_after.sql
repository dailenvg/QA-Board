-- When an archived project is due to be deleted for good: 30 days after it was archived, set by
-- archiving and cleared by unarchiving (lib/workspace/projects.ts). The Storage page shows it;
-- the purge that acts on it comes later, and reads the partial index. Only an archived project
-- has one (the CHECK). Projects archived before this ran had no warning, so they get the later of
-- their own date and 30 days from now. The backfill runs only in the step that adds the column,
-- so running this again never moves a date. A nullable column without a default doesn't rewrite
-- the table, and shares never read it, so every review link keeps working.

DO $$
BEGIN
  -- Looked up in this schema (the search path's), not by name alone: tables are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'projects'
      AND column_name = 'delete_after'
  ) THEN
    ALTER TABLE projects ADD COLUMN delete_after timestamptz;
    UPDATE projects
    SET delete_after = GREATEST(archived_at + interval '30 days', now() + interval '30 days')
    WHERE archived_at IS NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_delete_after_archived' AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_delete_after_archived
      CHECK (delete_after IS NULL OR archived_at IS NOT NULL);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS projects_delete_after_idx
  ON projects (delete_after) WHERE delete_after IS NOT NULL;
