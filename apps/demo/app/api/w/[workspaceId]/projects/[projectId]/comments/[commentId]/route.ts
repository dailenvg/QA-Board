import { can } from "@/lib/auth/permissions";
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

/**
 * `PATCH { body?, status?, crop? }`: edits, resolves or reopens the comment,
 * or adds its crop. Any member resolves and reopens; the text and crop are
 * the author's alone. 404 for a comment the patch may not change, as for one
 * that isn't there.
 */
export const PATCH = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
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
    { userId: user.id },
  );
  return comment ? json(comment) : notFound();
});

/**
 * `DELETE`: the author deletes their own comment; the owner, anyone's
 * (`comment.moderate`), a client's included. 404 for one the caller may not
 * delete, as for one that isn't there.
 */
export const DELETE = withMember<Params>(
  async (_request, { db, user, membership, workspaceId }, params) => {
    const target = ids(params);
    const actor = { userId: user.id, canModerate: can(membership, "comment.moderate") };
    const deleted =
      target !== null &&
      (await deleteComment(db, workspaceId, target.projectId, target.commentId, actor));
    return deleted ? noContent() : notFound();
  },
);
