import type { Comment, Reply, SquintData } from "./types";

/**
 * How a delete goes (D25): `undo` deletes at once with an Undo that posts it
 * all back as the member's own; `confirm` asks first, then deletes for good
 * once the server has (`deleteOthersComment`, `deleteOthersReply`).
 */
export type DeleteMode = "undo" | "confirm";

/** A comment's replies, oldest first. */
export function repliesFor(data: SquintData, comment: Pick<Comment, "id" | "projectId">): Reply[] {
  return data.replies
    .filter((reply) => reply.commentId === comment.id && reply.projectId === comment.projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Deleting a comment with `replies`: with Undo while every reply is the
 * member's own (or there's none), since the server would make whoever posts
 * them back their author; once anyone else replied, a confirm and no Undo.
 */
export function commentDeleteMode(replies: readonly Reply[]): DeleteMode {
  return replies.every((reply) => reply.mine) ? "undo" : "confirm";
}

/** Deleting a reply: one's own with Undo; anyone else's (the owner moderating) after a confirm. */
export function replyDeleteMode(reply: Pick<Reply, "mine">): DeleteMode {
  return reply.mine ? "undo" : "confirm";
}
