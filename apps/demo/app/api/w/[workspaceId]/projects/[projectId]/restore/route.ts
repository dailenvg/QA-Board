import { json } from "@/lib/share/http";
import { notFound, param } from "@/lib/workspace/http";
import { restoreProject } from "@/lib/workspace/projects";
import { idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `POST {}`: brings a trashed project back, with its share. */
export const POST = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const project = projectId && (await restoreProject(db, workspaceId, projectId));
  return project ? json(project) : notFound();
});
