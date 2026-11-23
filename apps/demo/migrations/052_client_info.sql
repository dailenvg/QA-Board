-- The browser a comment was posted from (`client_info`), for the team's "Get info": the user
-- agent the server saw, the window size and pixel ratio, and the platform version when the
-- browser shares it (lib/client-info/schema.ts has the shape). Kept raw and read at display time,
-- so a better parser later reads every comment again.
--
-- `comments.client_info`: a team comment's own, or a guest's brought in from the review link.
-- `squint_share_comments.client_info`: a guest's, recorded when they post on the link, so the
-- owner's pull can carry it to the workspace. A column, not inside `data`: the share manifest
-- digests `data`, and the guest view never selects this column. Owner rows never have one.
--
-- No backfill: older comments say "Not recorded". Nullable without a default, so nothing is
-- rewritten. The CHECK is only the named one below. Safe to run more than once.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS client_info jsonb;
ALTER TABLE squint_share_comments ADD COLUMN IF NOT EXISTS client_info jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_client_info_object' AND conrelid = 'comments'::regclass
  ) THEN
    ALTER TABLE comments ADD CONSTRAINT comments_client_info_object
      CHECK (client_info IS NULL OR jsonb_typeof(client_info) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_share_comments_client_info_object'
      AND conrelid = 'squint_share_comments'::regclass
  ) THEN
    ALTER TABLE squint_share_comments ADD CONSTRAINT squint_share_comments_client_info_object
      CHECK (client_info IS NULL OR jsonb_typeof(client_info) = 'object');
  END IF;
END;
$$;
