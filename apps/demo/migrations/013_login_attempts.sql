-- Failed sign-ins, for the login rate limit (5 per email and 20 per IP address in 15 minutes;
-- lib/auth/rate-limit.ts). In Postgres so every serverless instance sees the same counts. The
-- email is recorded as typed (normalized), whether or not an account has it. A success clears
-- that email's rows; rows older than a day are pruned. Safe to run more than once.

CREATE TABLE IF NOT EXISTS login_attempts (
  id     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email  text        NOT NULL,
  ip     text        NOT NULL,
  at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (email, at);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, at);
CREATE INDEX IF NOT EXISTS login_attempts_at_idx ON login_attempts (at);
