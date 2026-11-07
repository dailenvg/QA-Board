import { json } from "@/lib/share/http";
import { noContent, notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { getProject, trashProject, updateProject } from "@/lib/workspace/projects";
import { idSchema, projectPatchSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: one live project. */
export const GET = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const project = projectId && (await getProject(db, workspaceId, projectId));
  return project ? json(project) : notFound();
});

/** `PATCH { name?, folderId?, source? }`: a new source replaces the project's pages. */
export const PATCH = withMember<Params>(async (request, { db, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, projectPatchSchema);
  if (!body.ok) return body.response;
  const updated = await updateProject(db, workspaceId, projectId, body.value, now);
  return updated.ok ? json(updated.value) : refusal(updated.reason);
});

/** `DELETE`: moves the project to the trash (restorable until the cron deletes it for good). */
export const DELETE = withMember<Params>(async (_request, { db, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  const trashed = projectId !== null && (await trashProject(db, workspaceId, projectId, now));
  return trashed ? noContent() : notFound();
});
