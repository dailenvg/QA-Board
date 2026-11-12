-- Who invited a workspace link's reviewers (`invited_by_user_id`, added by 022 and never filled
-- until now). From here on, attaching a link records the member who did it, and the first one
-- stays (lib/workspace/share-links.ts). Links attached before that are credited to their
-- workspace's owner (memberships: one owner per workspace). Anonymous shares (no workspace) stay
-- null, as do links already credited. Running this again changes nothing it changed before.

UPDATE squint_shares AS share
SET invited_by_user_id = owner.user_id
FROM memberships AS owner
WHERE owner.workspace_id = share.workspace_id
  AND owner.role = 'owner'
  AND share.workspace_id IS NOT NULL
  AND share.invited_by_user_id IS NULL;
