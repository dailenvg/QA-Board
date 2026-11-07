import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { setArchived } from "@/lib/workspace/projects";
import { archiveSchema, idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `PUT { archived }`: archives or unarchives the project. */
export const PUT = withMember<Params>(async (request, { db, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, archiveSchema);
  if (!body.ok) return body.response;
  const project = await setArchived(db, workspaceId, projectId, body.value.archived, now);
  return project ? json(project) : notFound();
});
