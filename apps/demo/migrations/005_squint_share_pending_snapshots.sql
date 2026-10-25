-- A client capture inserts its snapshot as pending before storing the image, so cleanup sees
-- the image as referenced from the moment it lands; it's confirmed (with a fresh seq) once
-- stored. Pending rows are invisible to every read but blob bookkeeping. Safe to run more
-- than once.

ALTER TABLE squint_share_snapshots ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;
