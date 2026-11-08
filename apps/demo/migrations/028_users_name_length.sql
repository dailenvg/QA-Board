-- A user's name (shown on their comments, and set on /account/profile) is 1 to 80 characters
-- once trimmed, or none. Added NOT VALID: new and updated rows are checked, but rows written
-- before it aren't, so a longer name already in production can't stop migrate() on the first
-- request. Safe to run more than once.

DO $$
BEGIN
  -- Looked up on this table (the search path's), not by name alone: names are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_name_length' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_name_length
      CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80) NOT VALID;
  END IF;
END;
$$;
