-- Password reset links sent by email. Like sessions, only the token's sha256 is stored. A
-- link works once (`used_at`) and for one hour (`expires_at`). Safe to run more than once.

CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at);
