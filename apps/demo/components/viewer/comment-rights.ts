import type { Comment } from "@/lib/store/types";

/** Who's looking at a comment: the workspace's team (or a shared link's guest), and its owner. */
export interface CommentViewer {
  /** In the workspace, not on a shared link: comments can be resolved there. */
  team: boolean;
  /** The workspace's owner (`comment.moderate`): may delete anyone's comment. */
  moderator: boolean;
}

/**
 * How a delete goes: `undo`, at once with an Undo toast (the member's own, or
 * a client's, which Undo brings back from the review link); `confirm`, after
 * a dialog and only once the server has it (someone else's, which nothing
 * can bring back as theirs).
 */
export type CommentDelete = "undo" | "confirm";

export interface CommentRights {
  edit: boolean;
  delete: CommentDelete | null;
}

const NONE: CommentRights = { edit: false, delete: null };

/**
 * What `viewer` may do to `comment` beyond resolving it (decision 6): only
 * its author edits it; its author or the owner deletes it. A client's has no
 * author here, so only the owner deletes it, and nobody edits it.
 */
export function commentRights(comment: Comment, viewer: CommentViewer): CommentRights {
  if (!viewer.team) return NONE;
  if (comment.mine) return { edit: true, delete: "undo" };
  if (!viewer.moderator) return NONE;
  return { edit: false, delete: comment.fromClient ? "undo" : "confirm" };
}
