-- How much each workspace stores: bytes and file count, kept by a trigger on workspace_blobs
-- (insert adds, delete subtracts, a resize or move does both), so reads never sum the blobs.
-- A row exists for every workspace from its creation (second trigger, and the backfill below).
-- Deletes only ever update: while a workspace itself is being deleted, its blob rows go in the
-- same statement and must not re-create its usage row. The nightly cron can recompute these
-- from workspace_blobs if they ever drift. Safe to run more than once.

CREATE TABLE IF NOT EXISTS storage_usage (
  workspace_id  uuid        PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  bytes         bigint      NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  blob_count    integer     NOT NULL DEFAULT 0 CHECK (blob_count >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION storage_usage_track_blob() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE storage_usage
    SET bytes = GREATEST(bytes - OLD.size, 0),
        blob_count = GREATEST(blob_count - 1, 0),
        updated_at = now()
    WHERE workspace_id = OLD.workspace_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO storage_usage (workspace_id, bytes, blob_count)
    VALUES (NEW.workspace_id, NEW.size, 1)
    ON CONFLICT (workspace_id) DO UPDATE
    SET bytes = storage_usage.bytes + EXCLUDED.bytes,
        blob_count = storage_usage.blob_count + 1,
        updated_at = now();
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER workspace_blobs_storage_usage
  AFTER INSERT OR DELETE OR UPDATE OF workspace_id, size ON workspace_blobs
  FOR EACH ROW EXECUTE FUNCTION storage_usage_track_blob();

CREATE OR REPLACE FUNCTION storage_usage_track_workspace() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO storage_usage (workspace_id) VALUES (NEW.id) ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER workspaces_storage_usage
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION storage_usage_track_workspace();

INSERT INTO storage_usage (workspace_id, bytes, blob_count)
SELECT workspace.id, COALESCE(sum(blob.size), 0), count(blob.key)
FROM workspaces AS workspace
LEFT JOIN workspace_blobs AS blob ON blob.workspace_id = workspace.id
GROUP BY workspace.id
ON CONFLICT (workspace_id) DO NOTHING;
