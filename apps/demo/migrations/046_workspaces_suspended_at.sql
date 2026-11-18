-- The Squint admin's workspace actions (Milestone 4, admin panel).
--
-- `workspaces.suspended_at` (decision 1): while it's set the workspace is closed like an archived
-- one (`openWorkspace` in lib/auth/memberships.ts): its members can't open it, its review links
-- pause, and anyone with no other open workspace can't sign in (their sessions end when it's
-- suspended). Nothing is deleted; clearing it (unsuspending) opens everything again. Null: not
-- suspended.
--
-- `password_resets.by_admin` (decision 2): a reset link the admin made for a workspace's owner,
-- shown to the admin rather than emailed. The hourly cap on reset emails counts only emailed
-- links (false), so the admin's links never hold back the owner's own; a new admin link voids the
-- owner's earlier unused ones. Every existing link was emailed, so the default backfills them.
--
-- Nullable columns without defaults, and a constant default (Postgres 11+): nothing is rewritten.
-- Safe to run more than once.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS by_admin boolean NOT NULL DEFAULT false;
