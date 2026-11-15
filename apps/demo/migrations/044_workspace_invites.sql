-- Inviting people into a workspace (Workspace Members), and what a removal leaves on the account.
--
-- `workspace_invites`: one row per invitation by email. The link carries a random token; only its
-- sha256 is looked up (`token_hash`), and the token itself is kept sealed with AES-256-GCM
-- (`token_sealed`, lib/workspace/sealed-secrets.ts, bound to the workspace and the invite's id) so
-- the owner's Members page can show each open invite's link. The token never changes: Resend, or
-- inviting the address again once it expired, only moves `expires_at` to 7 days from then.
-- `role` is always 'member' (an owner only through a later transfer). `permissions` are the
-- switches the new member joins with: the defaults for the owner's invites, the defaults minus any
-- the inviting member lacks for theirs (041's values), and never 'people'. `last_sent_at` is the
-- last email Resend accepted, `last_send_error_at` the last one that didn't go out (refused, or
-- email off), and `send_count` how many went out. An invite is used once (`accepted_at`,
-- `accepted_user_id`) or cancelled (`revoked_at`, also when its owner deletes their account), never
-- both. One open invite per address and workspace. The daily cleanup (/api/cron/expire) deletes
-- invites that ended (accepted, cancelled or expired) more than 30 days ago, so addresses don't
-- linger; deleting the workspace deletes its invites.
--
-- `workspace_invite_sends`: one row per invite email, for the limit of 20 a day per workspace,
-- like 038's `squint_share_invite_sends`: no address, only which workspace and when. Rows older than
-- a day are deleted by the daily cleanup.
--
-- `users.removed_from`: the workspace a removal took the account out of, set with `deleted_at`. It
-- tells "removed by an owner" from "deleted their own account", and which workspace may bring the
-- account back by inviting it again within 24 hours. `users.removed_permissions`: that membership's
-- switches at the moment of removal, so a re-invite can't widen them. Both are set together and
-- cleared together (bringing the account back, restoring it, or the user deleting it themselves).
--
-- New tables, and nullable columns without defaults: nothing is rewritten. Safe to run more than
-- once.

CREATE TABLE IF NOT EXISTS workspace_invites (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email               text        NOT NULL
                                  CHECK (email = lower(btrim(email)) AND email LIKE '_%@_%'),
  role                text        NOT NULL DEFAULT 'member' CHECK (role = 'member'),
  token_hash          text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_sealed        text        NOT NULL,
  invited_by          uuid        REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  last_sent_at        timestamptz,
  last_send_error_at  timestamptz,
  send_count          integer     NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  accepted_at         timestamptz,
  accepted_user_id    uuid        REFERENCES users (id) ON DELETE SET NULL,
  revoked_at          timestamptz,
  permissions         text[]      NOT NULL DEFAULT ARRAY['review_links', 'trash', 'import']::text[],
  CONSTRAINT workspace_invites_permissions_known
    CHECK (permissions <@ ARRAY['review_links', 'trash', 'import']::text[]),
  CONSTRAINT workspace_invites_one_ending CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS workspace_invites_workspace_idx ON workspace_invites (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_open_email_idx
  ON workspace_invites (workspace_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS workspace_invites_open_expires_idx
  ON workspace_invites (expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS workspace_invite_sends (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  uuid        NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_invite_sends_workspace_idx
  ON workspace_invite_sends (workspace_id, at);
CREATE INDEX IF NOT EXISTS workspace_invite_sends_at_idx ON workspace_invite_sends (at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_from uuid
  REFERENCES workspaces (id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS removed_permissions text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_removed_permissions_known' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_removed_permissions_known
      CHECK (
        removed_permissions IS NULL
        OR removed_permissions <@ ARRAY['review_links', 'trash', 'import', 'people']::text[]
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS users_removed_from_idx ON users (removed_from)
  WHERE removed_from IS NOT NULL;
