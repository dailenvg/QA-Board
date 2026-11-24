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
 * A project's threads, each comment's replies oldest first, by comment id: one
 * pass over the workspace's replies for a viewer that shows many comments.
 */
export function threadsOf(replies: readonly Reply[], projectId: string): Map<string, Reply[]> {
  const threads = new Map<string, Reply[]>();
  for (const reply of replies) {
    if (reply.projectId !== projectId) continue;
    const thread = threads.get(reply.commentId);
    if (thread) thread.push(reply);
    else threads.set(reply.commentId, [reply]);
  }
  for (const thread of threads.values()) thread.sort((a, b) => a.createdAt - b.createdAt);
  return threads;
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
