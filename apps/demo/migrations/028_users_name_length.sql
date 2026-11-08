-- A user's name (shown on their comments, and set on /account/profile) is 1 to 80 characters
-- once trimmed, or none. A row that breaks the check would fail every later UPDATE of it (even a
-- sign-in's last_login_at), so existing names are put right first: trimmed, cut to 80
-- characters (and trimmed again, as the cut can end on a space), and a blank one cleared. Then
-- every row passes and the constraint is added validated. Safe to run more than once.

UPDATE users SET name = NULLIF(btrim(left(btrim(name), 80)), '')
WHERE NOT (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80);

DO $$
BEGIN
  -- Looked up on this table (the search path's), not by name alone: names are per schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_name_length' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_name_length
      CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 80);
  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_name_length' AND conrelid = 'users'::regclass AND NOT convalidated
  ) THEN
    -- Added NOT VALID by an earlier draft of this migration: the rows are clean now.
    ALTER TABLE users VALIDATE CONSTRAINT users_name_length;
  END IF;
END;
$$;
