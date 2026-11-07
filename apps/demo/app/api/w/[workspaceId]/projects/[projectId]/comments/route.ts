import { json } from "@/lib/share/http";
import { addComment, listComments } from "@/lib/workspace/comments";
import { notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { isLiveProject } from "@/lib/workspace/projects";
import { commentCreateSchema, idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: the project's comments, oldest first. */
export const GET = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  return json(await listComments(db, workspaceId, projectId));
});

/**
 * `POST`: a new comment by the signed-in member (201). Its snapshot or page
 * must be the project's (422 `unknown-surface`); 409 when the id is taken.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  const body = await readBody(request, commentCreateSchema);
  if (!body.ok) return body.response;
  const added = await addComment(db, workspaceId, projectId, body.value, user.id, now);
  return added.ok ? json(added.value, 201) : refusal(added.reason);
});
