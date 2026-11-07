import { noContent, notFound, param } from "@/lib/workspace/http";
import { idSchema } from "@/lib/workspace/schemas";
import { deleteSnapshot } from "@/lib/workspace/snapshots";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; snapshotId: string };

/** `DELETE`: deletes the snapshot and the comments on it. */
export const DELETE = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const snapshotId = param(idSchema, params.snapshotId);
  const deleted =
    projectId !== null &&
    snapshotId !== null &&
    (await deleteSnapshot(db, workspaceId, projectId, snapshotId));
  return deleted ? noContent() : notFound();
});
