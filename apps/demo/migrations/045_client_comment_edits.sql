-- Clients editing their own comments on a review link (Workspace Members, decision 6).
--
-- `edit_key_hash`: the sha256 (hex) of the edit key a client's browser gets back, once, when it
-- posts a comment (POST /api/s/<token>/comments). Only that browser can change the comment's
-- text, and only while it's active and the review window is open. The key itself is never
-- stored. Comments posted before this migration have none, so they can't be edited; owner rows
-- never have one.
--
-- `edit_seq`: taken from `squint_share_seq` on each client edit, so the owner's pull finds edits
-- to comments it has already pulled. Kept apart from `seq`, which the owner's deletes compare with
-- its cursor, so an edit never hides a comment from a delete.
--
-- `comments.edited_at` (042) is where the workspace keeps when a client last changed the words.
--
-- Nullable columns without defaults: nothing is rewritten. The CHECK is only the named one below.
-- Safe to run more than once.

ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS edit_key_hash text;
ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS edit_seq bigint;

CREATE INDEX IF NOT EXISTS squint_share_comments_edit_seq_idx
  ON squint_share_comments (share_id, edit_seq) WHERE edit_seq IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_share_comments_edit_key_hash'
      AND conrelid = 'squint_share_comments'::regclass
  ) THEN
    ALTER TABLE squint_share_comments ADD CONSTRAINT squint_share_comments_edit_key_hash
      CHECK (edit_key_hash IS NULL OR edit_key_hash ~ '^[0-9a-f]{64}$');
  END IF;
END;
$$;
