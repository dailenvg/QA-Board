-- Wrong passwords on protected review links, for their rate limit (5 per link and address, and 30
-- per address across every link, in 15 minutes; lib/share/password-attempts.ts). In Postgres so
-- every serverless instance sees the same counts. The address is never stored as it came: only an
-- HMAC of it, keyed from AUTH_SECRET. An attempt is recorded before its password is checked and
-- removed if it was right, so what's left are failures. Rows older than a day are pruned as new
-- attempts come in, and go with their share. Safe to run more than once.

CREATE TABLE IF NOT EXISTS squint_share_password_attempts (
  id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  share_id  text        NOT NULL REFERENCES squint_shares (id) ON DELETE CASCADE,
  ip_hash   text        NOT NULL,
  at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS squint_share_password_attempts_pair_idx
  ON squint_share_password_attempts (share_id, ip_hash, at);
CREATE INDEX IF NOT EXISTS squint_share_password_attempts_ip_idx
  ON squint_share_password_attempts (ip_hash, at);
CREATE INDEX IF NOT EXISTS squint_share_password_attempts_at_idx
  ON squint_share_password_attempts (at);
