-- Full-page captures of website projects, from the browser store's `Snapshot`. Comments on a
-- snapshot keep pointing at it, so a newer capture never moves older pins. `scale` is image px
-- per page px (below 1 when a very long page was rendered smaller). Safe to run more than once.

CREATE TABLE IF NOT EXISTS snapshots (
  project_id  text             NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id          text             NOT NULL,
  blob_key    text             NOT NULL,
  width       integer          NOT NULL CHECK (width > 0),
  height      integer          NOT NULL CHECK (height > 0),
  scale       double precision NOT NULL DEFAULT 1 CHECK (scale > 0 AND scale <= 1),
  source_url  text             NOT NULL,
  created_at  timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE INDEX IF NOT EXISTS snapshots_created_idx ON snapshots (project_id, created_at);
