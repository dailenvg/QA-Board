-- Each share gets the time it's deleted (lib/share/retention.ts), indexed for the daily expiry:
-- 30 days after its project was created, but never sooner than 5 days after the share itself,
-- so its "deletes on" notice always shows for 5 days. Shares saved before projects carried
-- `createdAt` count from the share's own creation. The project's time counts only when it's
-- whole epoch ms (from 2001-09-09, so epoch seconds never pass) and no later than the share,
-- matching `shareExpiresAt()`. The backfill adds one floor the server's rule doesn't need:
-- never sooner than 5 days after this migration runs, since nobody saw a date before then.
-- New rows default to 30 days from their insert, so an older deployment that doesn't send
-- `expires_at` can still create shares while both run against this database. One query, so
-- one transaction. Safe to run more than once: the backfill only touches rows still without
-- one, and the default is set after it so it never fills the backfill's rows.

ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS expires_at bigint;

UPDATE squint_shares
SET expires_at = GREATEST(
  CASE
    WHEN jsonb_typeof(project -> 'createdAt') IS DISTINCT FROM 'number' THEN created_at
    WHEN (project -> 'createdAt')::numeric = trunc((project -> 'createdAt')::numeric)
      AND (project -> 'createdAt')::numeric BETWEEN 1000000000000 AND created_at
      THEN (project -> 'createdAt')::numeric::bigint
    ELSE created_at
  END + 2592000000, -- 30 days in ms (RETENTION_MS)
  created_at + 432000000, -- 5 days in ms (DELETION_NOTICE_MS)
  (extract(epoch from now()) * 1000)::bigint + 432000000 -- 5 days after this migration
)
WHERE expires_at IS NULL;

ALTER TABLE squint_shares ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE squint_shares
  ALTER COLUMN expires_at SET DEFAULT ((extract(epoch from now()) * 1000)::bigint + 2592000000);

CREATE INDEX IF NOT EXISTS squint_shares_expires_at_idx ON squint_shares (expires_at);
