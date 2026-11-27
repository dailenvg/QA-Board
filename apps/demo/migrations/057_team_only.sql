-- Comments and replies the team keeps to itself (`team_only`). A team-only comment never reaches a
-- review link, and neither does any reply under it, whatever the reply's own flag says. A
-- team-only reply under a comment clients see stays off the link too. The server enforces it
-- (lib/share/service.ts drops them from every push, attach purges them, and making a comment team
-- only deletes the link's copy in the same transaction), so a stale browser tab can't publish one.
--
-- Only the team's own words can be team only: a guest's comment or reply never is (the CHECKs).
-- A reply written while its comment is team only is stored team only for good, so showing the
-- comment later publishes only the replies clients could already see.
--
-- No backfill: everything stays visible as it is today. A constant default rewrites nothing;
-- adding each CHECK reads its table once. Safe to run more than once.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS team_only boolean NOT NULL DEFAULT false;
ALTER TABLE comment_replies ADD COLUMN IF NOT EXISTS team_only boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_team_only_origin' AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments ADD CONSTRAINT comments_team_only_origin
      CHECK (NOT team_only OR origin = 'team');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_replies_team_only_origin' AND conrelid = 'comment_replies'::regclass
  ) THEN
    ALTER TABLE comment_replies ADD CONSTRAINT comment_replies_team_only_origin
      CHECK (NOT team_only OR origin = 'team');
  END IF;
END;
$$;
