import { json } from "@/lib/share/http";
import { applyClientEdit } from "@/lib/workspace/comments";
import { notFound, param } from "@/lib/workspace/http";
import { idSchema } from "@/lib/workspace/schemas";
import { findGuestComment } from "@/lib/workspace/share-links";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; commentId: string };

/**
 * `POST {}`: copies a client's edit, pulled from the project's review link,
 * onto their comment here (4.12). The words come from the link, never from
 * the request, and only replace older ones. Answers the comment as it is now;
 * 404 when it isn't a client's comment on both (the team deleted it, or it
 * was never there): nothing is ever added.
 */
export const POST = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const commentId = param(idSchema, params.commentId);
  if (!projectId || !commentId) return notFound();
  const guest = await findGuestComment(db, workspaceId, projectId, commentId);
  const comment = guest && (await applyClientEdit(db, workspaceId, projectId, commentId, guest));
  return comment ? json(comment) : notFound();
});
