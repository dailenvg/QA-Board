-- Parts of an image uploaded in several requests (each under Vercel's 4.5 MB body limit).
-- Assembled into squint_share_blobs when the last part arrives, then deleted. Safe to run more than once.

CREATE TABLE IF NOT EXISTS squint_share_blob_parts (
  share_id  text    NOT NULL REFERENCES squint_shares (id) ON DELETE CASCADE,
  key       text    NOT NULL,
  part      integer NOT NULL,
  bytes     bytea   NOT NULL,
  PRIMARY KEY (share_id, key, part)
);
