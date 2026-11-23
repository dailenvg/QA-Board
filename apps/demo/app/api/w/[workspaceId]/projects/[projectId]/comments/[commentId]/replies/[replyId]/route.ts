import { can } from "@/lib/auth/permissions";
import { json } from "@/lib/share/http";
import { noContent, notFound, param, readBody } from "@/lib/workspace/http";
import { deleteReply, updateReply } from "@/lib/workspace/replies";
import { idSchema, replyPatchSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; commentId: string; replyId: string };

function ids(params: Params) {
  const projectId = param(idSchema, params.projectId);
  const commentId = param(idSchema, params.commentId);
  const id = param(idSchema, params.replyId);
  return projectId && commentId && id ? { projectId, commentId, id } : null;
}

/**
 * `PATCH { body }`: changes the words of the caller's own reply. Nobody
 * edits anyone else's, the owner included, nor a client's. 404 for a reply
 * the caller may not change, as for one that isn't there.
 */
export const PATCH = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const target = ids(params);
  if (!target) return notFound();
  const body = await readBody(request, replyPatchSchema);
  if (!body.ok) return body.response;
  const reply = await updateReply(db, workspaceId, target, body.value, now, { userId: user.id });
  return reply ? json(reply) : notFound();
});

/**
 * `DELETE`: the author deletes their own reply; the owner, anyone's
 * (`comment.moderate`), a client's included. 404 for one the caller may not
 * delete, as for one that isn't there.
 */
export const DELETE = withMember<Params>(
  async (_request, { db, user, membership, workspaceId }, params) => {
    const target = ids(params);
    const actor = { userId: user.id, canModerate: can(membership, "comment.moderate") };
    const deleted = target !== null && (await deleteReply(db, workspaceId, target, actor));
    return deleted ? noContent() : notFound();
  },
);
