-- Signed-in browsers. The cookie holds a random 32-byte token; only its sha256 is stored here
-- (lib/auth/sessions.ts). `expires_at` slides forward while the session is used (30 days).
-- Signing out deletes the row; changing a password deletes all of the user's rows.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
