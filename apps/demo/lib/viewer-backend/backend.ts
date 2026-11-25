import { createContext, useContext } from "react";
import type { ClientInfo } from "../client-info/schema";
import type { CaptureFailure } from "../capture/messages";
import type { ImageUpload } from "../store/actions";
import type { Result } from "../store/store";
import type {
  Comment,
  CommentPriority,
  CommentStatus,
  Rect,
  Reply,
  Snapshot,
} from "../store/types";

export type ViewerRole = "owner" | "client";

export interface NewComment {
  /** Chosen when the pin is placed, so sending again after a failure can't post it twice. */
  id: string;
  projectId: string;
  x: number;
  y: number;
  body: string;
  author: string;
  snapshotId?: string;
  /** The page the pin is on (page projects, when not on a snapshot). */
  pageId?: string;
  /** Picked in the composer; missing for none. */
  priority?: CommentPriority;
  /** The browser posting it (`captureClientInfo`), when it could be read. */
  clientInfo?: ClientInfo;
}

export interface NewReply {
  /** Chosen when the reply is written, so sending again after a failure can't post it twice. */
  id: string;
  projectId: string;
  commentId: string;
  body: string;
  author: string;
  /** The browser posting it (`captureClientInfo`), when it could be read. */
  clientInfo?: ClientInfo;
}

/** A crop being encoded: the picture arrives a moment after the screen was read. */
export interface PendingCrop {
  blob: Promise<Blob | null>;
  rect: Rect;
}

/** A comment's screenshot, rendered and ready to send (`prepareCrop`). */
export interface ReadyCrop {
  blob: Blob;
  rect: Rect;
}

/**
 * `failure`: the capture's own reason, when it has one (not for a locked or full share).
 * `partial`: only the top of a long page was captured in time; said once, never stored.
 */
export type CaptureOutcome =
  | { ok: true; snapshot: Snapshot; partial?: true }
  | { ok: false; message: string; failure?: CaptureFailure };

/**
 * Why an edit that waits for the server wasn't saved. A `final` one can't be
 * retried (the comment is resolved, gone, or the review window closed): the
 * editor keeps the text to copy and offers only Close.
 */
export interface EditRefusal {
  error: string;
  final: boolean;
}

/** `unchanged`: the words were the same, so nothing was sent and there's nothing to confirm. */
export type EditOutcome = { ok: true; unchanged?: true } | ({ ok: false } & EditRefusal);

/**
 * Everything the viewer changes, behind one interface: the owner's local
 * store, or a shared link's server. The role decides which controls show;
 * client implementations refuse the owner-only calls anyway.
 */
export interface ViewerBackend {
  role: ViewerRole;
  /**
   * Resolves once the comment is saved (the owner's store) or accepted by the
   * server (a shared link), never rejecting. On failure nothing is lost: the
   * caller keeps the draft. `crop` null: there's no screenshot to send (a live
   * frame, or every try to render one failed); a shared link posts the comment
   * marked `screenshotPending`.
   */
  addComment(input: NewComment, crop: ReadyCrop | null): Promise<Result<Comment>>;
  setAuthorName(name: string): void;
  setCommentStatus(id: string, status: CommentStatus): Result;
  /** The team's: sets or clears (null) any comment's priority. A guest picks one only when posting. */
  setCommentPriority(id: string, priority: CommentPriority | null): Result;
  editComment(id: string, body: string): Result;
  /**
   * A shared link's guest changing the words of a comment they posted from
   * this browser (4.12): resolves once the server has it or refused it.
   * Missing for the owner, whose edits go through `editComment` at once.
   */
  editOwnComment?(id: string, body: string): Promise<EditOutcome>;
  deleteComment(id: string): Result;
  /** Undo for `deleteComment`, with the comment's replies when they're all the member's own (D25). */
  restoreComment(comment: Comment, replies?: Reply[]): Result;
  /**
   * Resolves once the reply is saved, never rejecting; on failure the caller
   * keeps the text. A reply never reopens its comment.
   */
  addReply(input: NewReply): Promise<Result<Reply>>;
  /** New words for the member's own reply. */
  editReply(id: string, body: string): Result;
  /** Deletes the member's own reply; `restoreReply` is its Undo. */
  deleteReply(id: string): Result;
  restoreReply(reply: Reply): Result;
  /** See `replaceWithImage` in `lib/store/actions`. */
  replaceWithImage(
    projectId: string,
    image: ImageUpload,
    target: { referenceUrl: string | undefined; pageId: string | null },
  ): Promise<Result>;
  /** Snapshots the project's site at `width`; null when aborted. */
  captureSnapshot(
    projectId: string,
    url: string,
    width: number,
    signal: AbortSignal,
  ): Promise<CaptureOutcome | null>;
}

export const OWNER_ONLY = "Only the project owner can do that.";

/** A comment that wasn't sent, for no reason more specific. The draft keeps its text and offers Retry. */
export const NOT_SENT = "Your comment wasn't sent. Retry in a moment.";

/** A reply that wasn't sent, for no reason more specific. The reply box keeps its text. */
export const REPLY_NOT_SENT = "Your reply wasn't sent. Retry in a moment.";

export const ViewerBackendContext = createContext<ViewerBackend | null>(null);

export function useViewerBackend(): ViewerBackend {
  const backend = useContext(ViewerBackendContext);
  if (!backend) throw new Error("Viewer rendered without a backend.");
  return backend;
}
