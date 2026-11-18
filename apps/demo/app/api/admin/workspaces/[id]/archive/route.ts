import { withAdminWorkspace } from "@/lib/admin/with-admin";
import { archiveWorkspace, unarchiveWorkspace } from "@/lib/admin/workspace-actions";
import { workspaceAnswer } from "@/lib/admin/workspace-answer";
import { noFieldsSchema } from "@/lib/admin/workspace-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `PUT {}`: the admin archives the workspace (`archiveWorkspace`): it closes
 * and keeps everything, with no deletion scheduled. Answers `{ workspace }`;
 * 404 for an unknown one.
 */
export const PUT = withAdminWorkspace(noFieldsSchema, async ({ db, target, now }) =>
  workspaceAnswer(db, target, await archiveWorkspace(db, target, now)),
);

/** `DELETE {}`: the admin unarchives it, open again as it was. Answers `{ workspace }`. */
export const DELETE = withAdminWorkspace(noFieldsSchema, async ({ db, target, now }) =>
  workspaceAnswer(db, target, await unarchiveWorkspace(db, target, now)),
);
