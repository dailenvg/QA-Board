-- What each member may do besides the work every member does (Workspace Members, decision 7):
-- the owner's switches for one member, `permissions` on their membership. The values:
-- 'review_links' (manage client review links: attach, revoke, review window, client name,
-- password, client invites), 'trash' (move projects to trash and restore them), 'import' (import
-- local data) and 'people' (invite and remove people). The first three are on by default and
-- 'people' is off; that default applies to every existing row and every new member, so nobody
-- loses anything when this runs. The owner's row carries it too, but nothing reads it: the owner
-- may do everything (lib/auth/permissions.ts). One array with a subset check, rather than four
-- booleans, keeps one column to read and audit; a fifth switch later is one CHECK change.
--
-- A constant default rewrites nothing (Postgres 11+). Safe to run more than once.

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL
  DEFAULT ARRAY['review_links', 'trash', 'import']::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'memberships_permissions_known' AND conrelid = 'memberships'::regclass
  ) THEN
    ALTER TABLE memberships ADD CONSTRAINT memberships_permissions_known
      CHECK (permissions <@ ARRAY['review_links', 'trash', 'import', 'people']::text[]);
  END IF;
END;
$$;
