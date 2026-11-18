import { withAdminWorkspace } from "@/lib/admin/with-admin";
import { suspendWorkspace, unsuspendWorkspace } from "@/lib/admin/workspace-actions";
import { workspaceAnswer } from "@/lib/admin/workspace-answer";
import { noFieldsSchema } from "@/lib/admin/workspace-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `PUT {}`: the admin suspends the workspace (`suspendWorkspace`): it closes,
 * its review links pause, and its people with no other open workspace are
 * signed out and can't sign in. Answers `{ workspace }`; 404 for an unknown one.
 */
export const PUT = withAdminWorkspace(noFieldsSchema, async ({ db, target, now }) =>
  workspaceAnswer(db, target, await suspendWorkspace(db, target, now)),
);

/** `DELETE {}`: the admin lifts the suspension. Answers `{ workspace }`. */
export const DELETE = withAdminWorkspace(noFieldsSchema, async ({ db, target, now }) =>
  workspaceAnswer(db, target, await unsuspendWorkspace(db, target, now)),
);
