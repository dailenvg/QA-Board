import { json } from "@/lib/share/http";
import { notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { isLiveProject } from "@/lib/workspace/projects";
import { idSchema, snapshotSchema } from "@/lib/workspace/schemas";
import { addSnapshot, listSnapshots } from "@/lib/workspace/snapshots";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: the project's snapshots, oldest first. */
export const GET = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  return json(await listSnapshots(db, workspaceId, projectId));
});

/** `POST`: a new snapshot (201); its image is uploaded under its `blobKey`. 409 when the id is taken. */
export const POST = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  const body = await readBody(request, snapshotSchema);
  if (!body.ok) return body.response;
  const added = await addSnapshot(db, workspaceId, projectId, body.value);
  return added.ok ? json(added.value, 201) : refusal(added.reason);
});
