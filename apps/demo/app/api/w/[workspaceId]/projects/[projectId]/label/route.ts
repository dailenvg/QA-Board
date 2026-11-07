import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { setLabel } from "@/lib/workspace/projects";
import { idSchema, labelSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `PUT { label }`: sets the project's label, or clears it with null. */
export const PUT = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, labelSchema);
  if (!body.ok) return body.response;
  const project = await setLabel(db, workspaceId, projectId, body.value.label);
  return project ? json(project) : notFound();
});
