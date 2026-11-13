-- Who a review link is for, and inviting them by email (Milestone 3).
--
-- `client_name`: the client the link is for, as the owner names it in the Share window (PATCH
-- .../share-link/settings). Guests read "{Company} has invited {Client} to review {Project}", the
-- invitation email greets them by it, and the link preview names it. Null: no name, "invited
-- you". The app trims it and strips control characters and line breaks
-- (lib/share/client-name.ts); the check keeps any other writer to 1 to 80 characters, trimmed.
--
-- `invited_count`: how many different people the link's invitation emails have gone to, for the
-- Share window's "Sent to N people". No invitee list is kept: each send records only HMACs of its
-- addresses in the audit log (`share.invites_sent`), keyed from AUTH_SECRET, and the count is
-- recounted from there after every send (lib/workspace/share-invites.ts).
--
-- `squint_share_invite_sends`: one row per address sent, for the invite rate limits (30 per
-- workspace and 20 per member in an hour; lib/share/invite-limits.ts), in Postgres so every
-- serverless instance sees the same counts. No address: only who sent, for which workspace, and
-- when. Rows older than a day are deleted by the daily cleanup (/api/cron/expire).
--
-- Nullable or constant-default columns don't rewrite the table. Safe to run more than once.

ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS invited_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_shares_client_name_length' AND conrelid = 'squint_shares'::regclass
  ) THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_client_name_length
      CHECK (
        client_name IS NULL
        OR (char_length(client_name) BETWEEN 1 AND 80 AND client_name = btrim(client_name))
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_shares_invited_count' AND conrelid = 'squint_shares'::regclass
  ) THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_invited_count
      CHECK (invited_count >= 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS squint_share_invite_sends (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES users (id) ON DELETE SET NULL,
  at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS squint_share_invite_sends_workspace_idx
  ON squint_share_invite_sends (workspace_id, at);
CREATE INDEX IF NOT EXISTS squint_share_invite_sends_user_idx
  ON squint_share_invite_sends (user_id, at);
CREATE INDEX IF NOT EXISTS squint_share_invite_sends_at_idx
  ON squint_share_invite_sends (at);
