import { can } from "@/lib/auth/permissions";
import { json } from "@/lib/share/http";
import { changeComment, deleteComment, setCommentTeamOnly } from "@/lib/workspace/comments";
import { noContent, notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { discardLinkFiles } from "@/lib/workspace/share-links";
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
 * `PATCH { body?, status?, priority?, crop? }`: edits, resolves or reopens the
 * comment, sets or clears (null) its priority, or adds its crop. Any member
 * resolves, reopens and sets the priority; the text and crop are the author's alone. Resolving a client's comment also locks it on the
 * review link (`changeComment`). 404 for a comment the patch may not change,
 * as for one that isn't there.
 *
 * `PATCH { teamOnly }`, on its own: makes it team only or shows it to clients
 * (its author or the owner). Making it team only takes it off the review
 * link at once, with its team replies and crop; 409 `has-client-replies`
 * once a client has replied to it (`setCommentTeamOnly`).
 */
export const PATCH = withMember<Params>(
  async (request, { db, user, membership, workspaceId, now }, params) => {
    const target = ids(params);
    if (!target) return notFound();
    const body = await readBody(request, commentPatchSchema);
    if (!body.ok) return body.response;
    if (body.value.teamOnly !== undefined) {
      const actor = { userId: user.id, canModerate: can(membership, "comment.moderate") };
      const where = { workspaceId, projectId: target.projectId, id: target.commentId };
      const changed = await setCommentTeamOnly(db, where, body.value.teamOnly, now, actor);
      if (!changed.ok) return refusal(changed.reason);
      await discardLinkFiles(changed.value.discard);
      return json(changed.value.value);
    }
    const comment = await changeComment(
      db,
      workspaceId,
      target.projectId,
      target.commentId,
      body.value,
      now,
      { userId: user.id },
    );
    return comment ? json(comment) : notFound();
  },
);

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
