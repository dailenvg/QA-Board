-- A workspace's sender name (the "{name} via Squint" of its emails, set on /account/workspace)
-- is 1 to 64 characters once trimmed, or none, when emails use the workspace's name. 64 is
-- lib/email/from-header.ts's SENDER_NAME_MAX: a longer one would be cut on every email. As in
-- 028, existing values are put right first (trimmed, cut to 64 characters and trimmed again, a
-- blank one cleared), so the constraint goes on validated. Safe to run more than once.

UPDATE workspaces SET from_email_name = NULLIF(btrim(left(btrim(from_email_name), 64)), '')
WHERE NOT (from_email_name IS NULL OR length(btrim(from_email_name)) BETWEEN 1 AND 64);

DO $$
BEGIN
  -- Looked up on this table (the search path's), not by name alone: names are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspaces_from_email_name_length' AND conrelid = 'workspaces'::regclass
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_from_email_name_length
      CHECK (from_email_name IS NULL OR length(btrim(from_email_name)) BETWEEN 1 AND 64);
  END IF;
END;
$$;
