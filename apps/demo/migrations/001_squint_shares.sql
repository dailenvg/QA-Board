-- Squint shares: one row per shared project, plus its snapshots, comments and images.
-- Safe to run more than once. Times are epoch milliseconds, like the browser store.

CREATE SEQUENCE IF NOT EXISTS squint_share_seq;

CREATE TABLE IF NOT EXISTS squint_shares (
  id              text   PRIMARY KEY,
  token_hash      text   NOT NULL UNIQUE,
  owner_key_hash  text   NOT NULL,
  project         jsonb  NOT NULL,
  created_at      bigint NOT NULL,
  updated_at      bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS squint_share_snapshots (
  share_id  text   NOT NULL REFERENCES squint_shares (id) ON DELETE CASCADE,
  id        text   NOT NULL,
  data      jsonb  NOT NULL,
  origin    text   NOT NULL CHECK (origin IN ('owner', 'client')),
  seq       bigint NOT NULL DEFAULT nextval('squint_share_seq'),
  PRIMARY KEY (share_id, id)
);

CREATE TABLE IF NOT EXISTS squint_share_comments (
  share_id  text   NOT NULL REFERENCES squint_shares (id) ON DELETE CASCADE,
  id        text   NOT NULL,
  data      jsonb  NOT NULL,
  origin    text   NOT NULL CHECK (origin IN ('owner', 'client')),
  seq       bigint NOT NULL DEFAULT nextval('squint_share_seq'),
  PRIMARY KEY (share_id, id)
);

CREATE INDEX IF NOT EXISTS squint_share_snapshots_seq_idx ON squint_share_snapshots (share_id, seq);
CREATE INDEX IF NOT EXISTS squint_share_comments_seq_idx ON squint_share_comments (share_id, seq);

-- Bytes are stored here unless Vercel Blob is configured, then only its URL (never sent to browsers).
CREATE TABLE IF NOT EXISTS squint_share_blobs (
  share_id      text    NOT NULL REFERENCES squint_shares (id) ON DELETE CASCADE,
  key           text    NOT NULL,
  content_type  text    NOT NULL,
  size          integer NOT NULL,
  bytes         bytea,
  blob_url      text,
  PRIMARY KEY (share_id, key),
  CHECK ((bytes IS NULL) <> (blob_url IS NULL))
);
