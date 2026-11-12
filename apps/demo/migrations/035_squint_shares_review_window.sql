-- How long a share's clients can add comments and snapshots, in hours from the share's creation:
-- 24, 72 or 168 (7 days), or null for no limit. Until now every share closed after 72 hours, so
-- every existing share reads 72 (the default) and keeps the deadline it already had. Only a
-- workspace's link can be set to anything else (PATCH .../share-link/settings); an anonymous
-- share keeps 72. A column with a constant default doesn't rewrite the table. Safe to run more
-- than once.

ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS review_window_hours integer DEFAULT 72;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_shares_review_window_hours'
      AND conrelid = 'squint_shares'::regclass
  ) THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_review_window_hours
      CHECK (review_window_hours IS NULL OR review_window_hours IN (24, 72, 168));
  END IF;
END;
$$;
