-- Deleting an account from /account/profile schedules it rather than destroying it: the user is
-- soft-deleted (`deleted_at`, so they can't sign in) and due to be deleted for good 30 days later
-- (`users.delete_after`); a workspace they own alone is due then too (`workspaces.delete_after`),
-- and until then nobody works in it and its share links answer as revoked. Until the date
-- passes, clearing both columns (and `deleted_at`) restores everything as it was. The daily cron
-- (/api/cron/expire) deletes what's due and clears `users.delete_after`, leaving a scrubbed row.
-- Only a deleted user can have a delete date (the CHECK). Both columns are nullable without a
-- default, so adding them rewrites nothing, and every existing share keeps working.
-- Safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_after timestamptz;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS delete_after timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_delete_after_deleted' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_delete_after_deleted
      CHECK (delete_after IS NULL OR deleted_at IS NOT NULL);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS users_delete_after_idx
  ON users (delete_after) WHERE delete_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspaces_delete_after_idx
  ON workspaces (delete_after) WHERE delete_after IS NOT NULL;
