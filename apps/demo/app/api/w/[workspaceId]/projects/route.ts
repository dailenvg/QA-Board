import { json } from "@/lib/share/http";
import { readBody, refusal } from "@/lib/workspace/http";
import { createProject, listProjects, listTrash } from "@/lib/workspace/projects";
import { projectCreateSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/** `GET`: the live projects (archived included); `?trash=1` lists the trash instead. */
export const GET = withMember<Params>(async (request, { db, workspaceId }) => {
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  return json(trash ? await listTrash(db, workspaceId) : await listProjects(db, workspaceId));
});

/** `POST { id, folderId, name, source }`: a new project (201); 409 when the id is taken anywhere. */
export const POST = withMember<Params>(async (request, { db, workspaceId, now }) => {
  const body = await readBody(request, projectCreateSchema);
  if (!body.ok) return body.response;
  const created = await createProject(db, workspaceId, body.value, now);
  return created.ok ? json(created.value, 201) : refusal(created.reason);
});
