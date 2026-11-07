-- Workspace files can be kept in the row itself (`bytes`) when Vercel Blob isn't configured:
-- local development and the e2e server only (lib/workspace/inline-blob-driver.ts refuses to
-- run on Vercel). Exactly one of `blob_url` and `bytes` is set, as on squint_share_blobs.
-- Existing rows all have a URL and no bytes, so the CHECK holds for them. storage_usage counts
-- both kinds by `size`. Safe to run more than once.

ALTER TABLE workspace_blobs ALTER COLUMN blob_url DROP NOT NULL;
ALTER TABLE workspace_blobs ADD COLUMN IF NOT EXISTS bytes bytea;

DO $$
BEGIN
  -- Looked up on this table (the search path's), not by name alone: names are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_blobs_one_location' AND conrelid = 'workspace_blobs'::regclass
  ) THEN
    ALTER TABLE workspace_blobs ADD CONSTRAINT workspace_blobs_one_location
      CHECK ((bytes IS NULL) <> (blob_url IS NULL));
  END IF;
END;
$$;
