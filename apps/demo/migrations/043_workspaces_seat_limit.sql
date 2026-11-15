-- How many people a workspace holds (Workspace Members, decision 4): `seat_limit` counts the owner,
-- every member whose account isn't deleted, and every open invite that hasn't expired. Inviting
-- and accepting check it under the workspace's members lock (lib/workspace/members/seats.ts); it's
-- not a trigger, because restoring an account may take a workspace over it (decision 12). 10 by
-- default, so the owner can invite 9 people. Only the Squint admin changes it, by hand
-- (lib/account/set-seat-limit.sql), until the admin panel (M4) does; 1 to 100.
--
-- A constant default rewrites nothing (Postgres 11+). Safe to run more than once.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS seat_limit integer NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_seat_limit_range' AND conrelid = 'workspaces'::regclass
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_seat_limit_range
      CHECK (seat_limit BETWEEN 1 AND 100);
  END IF;
END;
$$;
