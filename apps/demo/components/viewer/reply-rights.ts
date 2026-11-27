import { replyDeleteMode, type DeleteMode } from "@/lib/store/replies";
import type { Comment, Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";

export interface ReplyRights {
  /** Change its words: the author's own reply only. Nobody edits a client's. */
  edit: boolean;
  /** `undo` for their own; `confirm` for the owner on anyone else's (`replyDeleteMode`). */
  delete: DeleteMode | null;
  /** "Get info", its browser details: the team's, never a guest's. */
  getInfo: boolean;
  /**
   * Make it team only, or show it to clients again (057, D9 a): its author or
   * the owner, on the team's own replies under a comment clients see (under a
   * team-only comment, the whole thread is kept to the team anyway).
   */
  share: boolean;
}

const NONE: ReplyRights = { edit: false, delete: null, getInfo: false, share: false };

/**
 * What `viewer` may do to `reply` (D1, decision 6): only its author edits it;
 * its author or the owner deletes it, and changes who sees it while its
 * comment (`commentTeamOnly`) is one clients see. A client's has no author
 * here, so only the owner deletes it, after a confirm, and it's never team
 * only. A review link's guest gets nothing (D2).
 */
export function replyRights(
  reply: Reply,
  viewer: CommentViewer,
  commentTeamOnly = false,
): ReplyRights {
  if (!viewer.team) return NONE;
  const share = !commentTeamOnly && !reply.fromClient && (reply.mine === true || viewer.moderator);
  if (reply.mine) return { edit: true, delete: "undo", getInfo: true, share };
  const remove = viewer.moderator ? replyDeleteMode(reply) : null;
  return { edit: false, delete: remove, getInfo: true, share };
}

/**
 * Whether `viewer` gets the reply box under `comment`: anyone on the team,
 * under an active or a resolved comment, and a reply never reopens it (D1,
 * D5). A review link's guest only under an active one (D4), while the review
 * window is open (D3).
 */
export function canReply(viewer: CommentViewer, comment: Pick<Comment, "status">): boolean {
  if (viewer.team) return true;
  return comment.status === "active" && viewer.reviewOpen !== false;
}

/** Said to a guest who can't reply, where the box would be. */
export const REPLY_CLOSED_NOTE = {
  windowClosed: "The review window has closed, so you can't reply.",
  resolved: "The team resolved this, so it's closed for replies.",
} as const;

/**
 * Why `viewer` has no reply box under `comment`, or null when they have one
 * (or are on the team, who always do). A closed window comes first: it
 * closes every thread, whatever their status.
 */
export function replyClosedNote(
  viewer: CommentViewer,
  comment: Pick<Comment, "status">,
): string | null {
  if (canReply(viewer, comment)) return null;
  return viewer.reviewOpen === false ? REPLY_CLOSED_NOTE.windowClosed : REPLY_CLOSED_NOTE.resolved;
}
