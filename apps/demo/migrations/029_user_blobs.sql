-- Files that belong to a user rather than a workspace: their avatar (set on /account/profile),
-- keyed `user/<userId>/avatar/<id>` and named by `users.avatar_blob_key`. Shaped like
-- workspace_blobs once 025 ran: a file lives in Vercel Blob (`blob_url`) or, for local
-- development and e2e only, in the row itself (`bytes`), and exactly one of them is set. They
-- don't count toward any workspace's storage. Users are soft-deleted, so the cascade only runs
-- when the job that hard-deletes a user removes the row, after deleting its files. Safe to run
-- more than once.

CREATE TABLE IF NOT EXISTS user_blobs (
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key           text        NOT NULL,
  content_type  text        NOT NULL,
  size          bigint      NOT NULL CHECK (size >= 0),
  blob_url      text,
  bytes         bytea,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  CONSTRAINT user_blobs_one_location CHECK ((bytes IS NULL) <> (blob_url IS NULL))
);
