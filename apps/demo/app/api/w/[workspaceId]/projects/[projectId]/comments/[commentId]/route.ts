import { json } from "@/lib/share/http";
import { deleteComment, updateComment } from "@/lib/workspace/comments";
import { noContent, notFound, param, readBody } from "@/lib/workspace/http";
import { commentPatchSchema, idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; commentId: string };

function ids(params: Params) {
  const projectId = param(idSchema, params.projectId);
  const commentId = param(idSchema, params.commentId);
  return projectId && commentId ? { projectId, commentId } : null;
}

/** `PATCH { body?, status?, crop? }`: edits, resolves or reopens the comment, or adds its crop. */
export const PATCH = withMember<Params>(async (request, { db, workspaceId, now }, params) => {
  const target = ids(params);
  if (!target) return notFound();
  const body = await readBody(request, commentPatchSchema);
  if (!body.ok) return body.response;
  const comment = await updateComment(
    db,
    workspaceId,
    target.projectId,
    target.commentId,
    body.value,
    now,
  );
  return comment ? json(comment) : notFound();
});

export const DELETE = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const target = ids(params);
  const deleted =
    target !== null && (await deleteComment(db, workspaceId, target.projectId, target.commentId));
  return deleted ? noContent() : notFound();
});
