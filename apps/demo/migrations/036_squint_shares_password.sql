-- A password on a workspace's review link: guests must enter it before the link shows anything
-- but the company's brand (lib/share/guest-pass.ts). `password_hash` is Argon2id, as for
-- accounts (lib/auth/password.ts); `password_set_at` changes with every new password. Both are
-- set together or both null (no password). Anonymous shares never have one: only a workspace's
-- link can be protected (PUT .../share-link/password). Nullable columns without a default don't
-- rewrite the table, and every existing link stays open. Safe to run more than once.

ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE squint_shares ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_shares_password_pair' AND conrelid = 'squint_shares'::regclass
  ) THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_password_pair
      CHECK ((password_hash IS NULL) = (password_set_at IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'squint_shares_password_workspace' AND conrelid = 'squint_shares'::regclass
  ) THEN
    ALTER TABLE squint_shares ADD CONSTRAINT squint_shares_password_workspace
      CHECK (password_hash IS NULL OR workspace_id IS NOT NULL);
  END IF;
END;
$$;
