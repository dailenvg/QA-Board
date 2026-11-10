-- Who a comment came from, stored when it's written: 'team' (a workspace member, or the owner's
-- own comments brought in from their browser) or 'client' (a guest's, pulled from the project's
-- review link). Until now the app inferred it from a missing author account, which also caught
-- comments whose author's account was deleted later (author_user_id is ON DELETE SET NULL).
-- Existing comments keep the label they show today: no author account, 'client'. Comments of
-- accounts deleted before this ran can't be told apart, so they stay 'client'. The backfill runs
-- only in the step that adds the column, so running this again never relabels the comments of
-- an account deleted since. A column with a constant default doesn't rewrite the table.

DO $$
BEGIN
  -- Looked up in this schema (the search path's), not by name alone: tables are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'comments' AND column_name = 'origin'
  ) THEN
    ALTER TABLE comments ADD COLUMN origin text NOT NULL DEFAULT 'team'
      CONSTRAINT comments_origin_check CHECK (origin IN ('team', 'client'));
    UPDATE comments SET origin = 'client' WHERE author_user_id IS NULL;
  END IF;
END;
$$;
