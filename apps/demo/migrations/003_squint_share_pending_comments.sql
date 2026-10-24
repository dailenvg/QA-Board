-- A client comment with a crop is inserted as pending (claiming its id atomically), its crop
-- is stored, then it's confirmed with a fresh seq. Pending rows are invisible to every read.
-- Safe to run more than once.

ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;
