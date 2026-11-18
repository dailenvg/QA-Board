import { withAdminWorkspace } from "@/lib/admin/with-admin";
import { setWorkspaceQuota } from "@/lib/admin/workspace-actions";
import { workspaceAnswer } from "@/lib/admin/workspace-answer";
import { quotaSchema } from "@/lib/admin/workspace-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `PUT { quotaBytes }`: the admin sets the workspace's storage quota, in
 * bytes, within the panel's bounds (400 outside them). Below what it stores
 * already is allowed. Answers `{ workspace }`; 404 for an unknown workspace.
 */
export const PUT = withAdminWorkspace(quotaSchema, async ({ db, target, body, now }) =>
  workspaceAnswer(db, target, await setWorkspaceQuota(db, target, body.quotaBytes, now)),
);
