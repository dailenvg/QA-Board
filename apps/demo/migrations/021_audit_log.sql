-- Who did what, for /admin and for deletions that must leave a record (a user's workspace data
-- being hard-deleted, credentials reset by the admin). `workspace_id` has no foreign key on
-- purpose: entries outlive a deleted workspace. `meta` never holds secrets or passwords.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS audit_log (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id  uuid        REFERENCES users (id) ON DELETE SET NULL,
  workspace_id   uuid,
  action         text        NOT NULL,
  target_type    text,
  target_id      text,
  meta           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log (workspace_id, at);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_user_id, at);
