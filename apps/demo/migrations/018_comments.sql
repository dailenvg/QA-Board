-- Pins and their comments, from the browser store's `Comment`. A comment sits on one surface:
-- a snapshot (`snapshot_id`), a page (`page_id`), or neither (older website comments). No
-- CHECK pins that down, so a later surface (comments on a live website) can be added without
-- rewriting this table. `author_user_id` is set for workspace users and null for guests, who
-- only have `author_name`. `crop` is the browser's `CommentCrop` (blob key and rect). Deleting
-- a page or snapshot deletes the comments on it. Safe to run more than once.

CREATE TABLE IF NOT EXISTS comments (
  project_id      text             NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id              text             NOT NULL,
  x               double precision NOT NULL,
  y               double precision NOT NULL,
  body            text             NOT NULL,
  author_name     text             NOT NULL,
  author_user_id  uuid             REFERENCES users (id) ON DELETE SET NULL,
  status          text             NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'resolved')),
  snapshot_id     text,
  page_id         text,
  crop            jsonb,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, snapshot_id) REFERENCES snapshots (project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, page_id) REFERENCES pages (project_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS comments_created_idx ON comments (project_id, created_at);
