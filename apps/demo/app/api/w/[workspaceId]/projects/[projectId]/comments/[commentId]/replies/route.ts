import { userAgentOf } from "@/lib/client-info/schema";
import { json } from "@/lib/share/http";
import { notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { isLiveProject } from "@/lib/workspace/projects";
import { addReply } from "@/lib/workspace/replies";
import { idSchema, replyCreateSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; commentId: string };

/**
 * `POST`: a reply by the signed-in member (201) to the comment, active or
 * resolved, under their own name whatever `author` says (it's only used
 * while they have none). The comment stays as it is. 404 for an unknown
 * project or comment, 409 when the id is taken. A member's `clientInfo` is
 * kept with the request's user agent, unless it brings its own (an Undo
 * putting back what was recorded). Only members post here: a guest's reply
 * is read from the review link, the way `comments` takes `fromShare`.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  const commentId = param(idSchema, params.commentId);
  if (!projectId || !commentId || !(await isLiveProject(db, workspaceId, projectId))) {
    return notFound();
  }
  const body = await readBody(request, replyCreateSchema);
  if (!body.ok) return body.response;
  const reply = body.value;
  const clientInfo = reply.clientInfo && {
    ...reply.clientInfo,
    userAgent: reply.clientInfo.userAgent ?? userAgentOf(request),
  };
  const author = { kind: "team" as const, userId: user.id };
  const added = await addReply(
    db,
    workspaceId,
    projectId,
    commentId,
    { ...reply, clientInfo },
    author,
    now,
  );
  return added.ok ? json(added.value, 201) : refusal(added.reason);
});
