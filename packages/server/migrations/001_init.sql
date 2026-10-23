-- pinpoint: initial schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS pinpoint_pins (
  id              text PRIMARY KEY,
  branch          text        NOT NULL,
  path            text        NOT NULL,
  deployment_url  text        NOT NULL,
  deep_link       text        NOT NULL,
  anchor          jsonb       NOT NULL,
  author          text        NOT NULL,
  body            text        NOT NULL,
  priority        text        CHECK (priority IN ('nit', 'should', 'must')),
  screenshot_url  text,
  context         jsonb       NOT NULL,
  resolved        boolean     NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinpoint_pins_branch_path_idx
  ON pinpoint_pins (branch, path, created_at);

CREATE TABLE IF NOT EXISTS pinpoint_replies (
  id          text PRIMARY KEY,
  pin_id      text        NOT NULL REFERENCES pinpoint_pins (id) ON DELETE CASCADE,
  author      text        NOT NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinpoint_replies_pin_idx
  ON pinpoint_replies (pin_id, created_at);
