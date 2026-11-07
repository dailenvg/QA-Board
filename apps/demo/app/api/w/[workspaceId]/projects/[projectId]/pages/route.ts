import { json } from "@/lib/share/http";
import { notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { getProject, updateProject } from "@/lib/workspace/projects";
import { idSchema, pagesBodySchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: the project's pages, in reading order (none for a website). */
export const GET = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const project = projectId && (await getProject(db, workspaceId, projectId));
  if (!project) return notFound();
  return json(project.source.kind === "pages" ? project.source.pages : []);
});

/**
 * `PUT { pages }`: the page project's pages, in order. Pages left out are
 * deleted with their comments. 409 `not-pages` for a website project.
 */
export const PUT = withMember<Params>(async (request, { db, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  const project = projectId && (await getProject(db, workspaceId, projectId));
  if (!projectId || !project) return notFound();
  const body = await readBody(request, pagesBodySchema);
  if (!body.ok) return body.response;
  if (project.source.kind !== "pages") return json({ error: "not-pages" }, 409);
  const source = { ...project.source, pages: body.value.pages };
  const updated = await updateProject(db, workspaceId, projectId, { source }, now);
  return updated.ok ? json(updated.value.source) : refusal(updated.reason);
});
