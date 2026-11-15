import { json } from "@/lib/share/http";
import { addComment, listComments } from "@/lib/workspace/comments";
import { notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { isLiveProject } from "@/lib/workspace/projects";
import { findGuestComment } from "@/lib/workspace/share-links";
import { commentCreateSchema, idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: the project's comments, oldest first; the signed-in member's are `mine`. */
export const GET = withMember<Params>(async (_request, { db, user, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  return json(await listComments(db, workspaceId, projectId, user.id));
});

/**
 * `POST`: a new comment by the signed-in member (201), under their own name
 * whatever `author` says (it's only used while they have none). With
 * `fromShare`, a guest's comment pulled from the project's review link, saved
 * without an author account and with when its words last changed there; 404
 * unless a guest posted that comment there.
 * Its snapshot or page must be the project's (422 `unknown-surface`); 409
 * when the id is taken.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  const body = await readBody(request, commentCreateSchema);
  if (!body.ok) return body.response;
  const { fromShare, ...comment } = body.value;
  const guest = fromShare ? await findGuestComment(db, workspaceId, projectId, comment.id) : null;
  if (fromShare && !guest) return notFound();
  const author = guest ? null : user.id;
  const editedAt = guest?.editedAt ?? null;
  const added = await addComment(db, workspaceId, projectId, comment, author, now, editedAt);
  return added.ok ? json(added.value, 201) : refusal(added.reason);
});
