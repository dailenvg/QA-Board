import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { setStage } from "@/lib/workspace/projects";
import { idSchema, stageSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/**
 * `PUT { stage }`: sets the project's stage (`open-for-review`, `editing`,
 * `on-hold` or `approved`), or clears it with null, and audits the change.
 * Any member may (`workspace.write`, as the label). Answers the project; 404
 * for one that isn't live in this workspace, 400 for any other stage.
 */
export const PUT = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, stageSchema);
  if (!body.ok) return body.response;
  const project = await setStage(
    db,
    { userId: user.id, workspaceId },
    projectId,
    body.value.stage,
    now,
  );
  return project ? json(project) : notFound();
});
