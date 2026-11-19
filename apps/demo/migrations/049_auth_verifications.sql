-- Password reset links move to Better Auth's verification model (Milestone 4a, PR 2): one row per
-- open link, used once (Better Auth deletes it), for one hour (`expires_at`).
--
-- `identifier` never holds a link's secret: only `sha256:reset-password:` and the secret's sha256
-- (lib/auth/reset-links.ts), as `password_resets.token_hash` did. It doesn't start with
-- `reset-password:`, so no lookup of a presented token in plain text can match a stored row.
-- `value` is the user's id. `by_admin` marks a link the admin made for a workspace's owner, which
-- the hourly cap on reset emails doesn't count (046).
--
-- The open rows of `password_resets` (unused, unexpired) are copied across, so links emailed just
-- before the deploy keep working: their stored hash is the same sha256. `password_resets` stays,
-- unread, until it's dropped (PR 5); a deploy from before this migration keeps using it and never
-- reads `verifications`.
--
-- A new, small table, and a copy of at most a few rows. Safe to run more than once: the table and
-- index only if missing, and a link only if it isn't there yet.

CREATE TABLE IF NOT EXISTS verifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text        NOT NULL,
  value       text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  by_admin    boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications (identifier);

INSERT INTO verifications (identifier, value, expires_at, created_at, updated_at, by_admin)
SELECT 'sha256:reset-password:' || r.token_hash, r.user_id::text, r.expires_at, r.created_at,
  r.created_at, r.by_admin
FROM password_resets AS r
WHERE r.used_at IS NULL AND r.expires_at > now()
  AND NOT EXISTS (
    SELECT 1 FROM verifications AS v WHERE v.identifier = 'sha256:reset-password:' || r.token_hash
  );
