import { replyDeleteMode, type DeleteMode } from "@/lib/store/replies";
import type { Reply } from "@/lib/store/types";
import type { CommentViewer } from "./comment-rights";

export interface ReplyRights {
  /** Change its words: the author's own reply only. Nobody edits a client's. */
  edit: boolean;
  /** `undo` for their own; `confirm` for the owner on anyone else's (`replyDeleteMode`). */
  delete: DeleteMode | null;
  /** "Get info", its browser details: the team's, never a guest's. */
  getInfo: boolean;
}

const NONE: ReplyRights = { edit: false, delete: null, getInfo: false };

/**
 * What `viewer` may do to `reply` (D1, decision 6): only its author edits it;
 * its author or the owner deletes it. A client's has no author here, so only
 * the owner deletes it, after a confirm. A review link's guest gets nothing
 * (D2).
 */
export function replyRights(reply: Reply, viewer: CommentViewer): ReplyRights {
  if (!viewer.team) return NONE;
  if (reply.mine) return { edit: true, delete: "undo", getInfo: true };
  return { edit: false, delete: viewer.moderator ? replyDeleteMode(reply) : null, getInfo: true };
}

/**
 * Whether `viewer` gets the reply box: anyone on the team, under an active or
 * a resolved comment, and a reply never reopens it (D1, D5). A review link's
 * guest doesn't reply yet.
 */
export function canReply(viewer: CommentViewer): boolean {
  return viewer.team;
}
