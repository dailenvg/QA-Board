-- Email address changes waiting to be confirmed. Asking for one (lib/account/email-change.ts)
-- mails a link to the new address; like password resets, only the token's sha256 is stored, and
-- a link works once (`used_at`) and for one hour (`expires_at`). `new_email` is stored the way
-- users.email is, trimmed and lowercased. Confirming one uses it up along with the user's other
-- pending ones. Safe to run more than once.

CREATE TABLE IF NOT EXISTS email_changes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_email   text        NOT NULL
                          CHECK (new_email = lower(btrim(new_email)) AND new_email LIKE '_%@_%'),
  token_hash  text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS email_changes_user_idx ON email_changes (user_id, created_at);
