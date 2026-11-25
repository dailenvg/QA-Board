-- How much a comment matters (`priority`): 'must' (Must fix), 'should' (Should fix) or 'nit'
-- (Nit). Null is no priority, which is where every comment starts: the person posting it picks
-- one or none, and any member changes it later, as they resolve and reopen. A priority change is
-- never an edit: `edited_at` stays as it is (lib/workspace/comments.ts).
--
-- Review links keep a comment's priority inside its `data` (squint_share_comments), as the rest
-- of what the link shows: the owner's push carries the team's, and a guest's comes with its post.
--
-- No backfill: existing comments have no priority. Nullable without a default, so nothing is
-- rewritten; adding the CHECK reads the table once. Safe to run more than once.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS priority text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_priority_check' AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments ADD CONSTRAINT comments_priority_check
      CHECK (priority IN ('must', 'should', 'nit'));
  END IF;
END;
$$;
