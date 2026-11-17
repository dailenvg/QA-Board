import type { Comment } from "@/lib/store/types";

/** Who's looking at a comment: the workspace's team (or a shared link's guest), and its owner. */
export interface CommentViewer {
  /** In the workspace, not on a shared link: comments can be resolved there. */
  team: boolean;
  /** The workspace's owner (`comment.moderate`): may delete anyone's comment. */
  moderator: boolean;
  /**
   * A shared link's review window is open, so its guest may still edit their
   * own comments (4.12). Missing reads as open; the team's rights ignore it.
   */
  reviewOpen?: boolean;
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
  /**
   * Say why there's no Edit: the guest's own comment, resolved by the team,
   * so its words are locked (4.12).
   */
  resolvedNote: boolean;
}

const NONE: CommentRights = { edit: false, delete: null, resolvedNote: false };

/**
 * A shared link's guest: only their own comments (posted from this browser,
 * `mine`), only their words, while active and the review window is open. They
 * never delete (D7).
 */
function guestRights(comment: Comment, viewer: CommentViewer): CommentRights {
  if (!comment.mine) return NONE;
  const active = comment.status === "active";
  return { edit: active && viewer.reviewOpen !== false, delete: null, resolvedNote: !active };
}

/**
 * What `viewer` may do to `comment` beyond resolving it (decision 6): only
 * its author edits it; its author or the owner deletes it. A client's has no
 * author here, so only the owner deletes it, and nobody on the team edits it:
 * its guest does, on the review link (`guestRights`).
 */
export function commentRights(comment: Comment, viewer: CommentViewer): CommentRights {
  if (!viewer.team) return guestRights(comment, viewer);
  if (comment.mine) return { edit: true, delete: "undo", resolvedNote: false };
  if (!viewer.moderator) return NONE;
  return { edit: false, delete: comment.fromClient ? "undo" : "confirm", resolvedNote: false };
}
