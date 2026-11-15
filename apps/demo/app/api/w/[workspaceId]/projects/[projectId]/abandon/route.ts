import { noContent, notFound, param } from "@/lib/workspace/http";
import { abandonProject } from "@/lib/workspace/projects";
import { idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/**
 * `POST {}`: deletes a page project whose upload failed (`abandonProject`):
 * only a new one with nothing in it, so every member may, trash switch or
 * not. 204; 404 for any other project (it stays as it is).
 */
export const POST = withMember<Params>(async (_request, { db, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  const abandoned = projectId !== null && (await abandonProject(db, workspaceId, projectId, now));
  return abandoned ? noContent() : notFound();
});
