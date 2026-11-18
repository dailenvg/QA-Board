-- The Squint admin suspending a workspace (Milestone 4, admin panel, decision 1). While
-- `suspended_at` is set the workspace is closed like an archived one (`openWorkspace` in
-- lib/auth/memberships.ts): its members can't open it, its review links pause, and anyone with
-- no other open workspace can't sign in (their sessions end when it's suspended). Nothing is
-- deleted; clearing it (unsuspending) opens everything again. Null: not suspended.
--
-- A nullable column without a default: nothing is rewritten. Safe to run more than once.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
