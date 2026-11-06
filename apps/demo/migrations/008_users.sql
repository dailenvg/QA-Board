-- Accounts that sign in with email and password. Phase 1 has two roles: `admin` (the code
-- owner; also the only role that reaches /admin) and `company` (a workspace's account). There
-- is no public signup. Emails are stored trimmed and lowercased, so the unique constraint is
-- case-insensitive. Users are soft-deleted (`deleted_at`); a deleted user can't sign in.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text        NOT NULL UNIQUE
                               CHECK (email = lower(btrim(email)) AND email LIKE '_%@_%'),
  password_hash    text        NOT NULL,
  name             text,
  avatar_blob_key  text,
  role             text        NOT NULL CHECK (role IN ('admin', 'company')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_login_at    timestamptz,
  deleted_at       timestamptz
);
