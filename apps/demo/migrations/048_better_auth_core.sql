-- Better Auth runs sign-in, sessions and sign-out (Milestone 4a, PR 1) on the tables Squint
-- already has, mapped column by column (lib/auth/better-auth.ts), rather than on tables of its own.
--
-- `users` gains the columns Better Auth's user model reads: `email_verified` (true: there is no
-- public sign-up, and nothing asks Better Auth to check it), `image` (unused: avatars stay in
-- `avatar_blob_key`) and `updated_at`.
--
-- `sessions` gains the columns Better Auth's session model reads: an `id` of its own (the token
-- stays the primary key), `updated_at`, and the browser's `ip_address` and `user_agent`.
-- `token_hash` now holds two kinds of token: the sha256 of a cookie from before this migration
-- (lib/auth/session-token.ts turns such a cookie into that hash on every read), or the plain
-- token of a session Better Auth started, whose cookie is signed with a key only the server
-- holds. So its hex-only CHECK goes. A deploy from before this migration keeps inserting hashed
-- rows (the defaults fill the new columns) and never matches a Better Auth token.
--
-- `auth_accounts` is where Better Auth looks for a password: one credential "account" per user,
-- over `users.password_hash`. A single-table view, so Postgres can update it: a password Better
-- Auth writes lands in `users.password_hash`, the only copy. The view pins that column: an ALTER
-- of `users.password_hash` must drop and recreate it.
--
-- `now()` is a stable default (Postgres 11+), so those columns rewrite nothing; `sessions.id`'s
-- random default rewrites `sessions`, a small table. Safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_token_hash_check;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_id_idx ON sessions (id);

CREATE OR REPLACE VIEW auth_accounts AS
  SELECT
    id,
    id::text AS account_id,
    'credential'::text AS provider_id,
    id AS user_id,
    NULL::text AS access_token,
    NULL::text AS refresh_token,
    NULL::text AS id_token,
    NULL::timestamptz AS access_token_expires_at,
    NULL::timestamptz AS refresh_token_expires_at,
    NULL::text AS scope,
    password_hash AS password,
    created_at,
    updated_at
  FROM users;
