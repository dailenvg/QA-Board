import { createContext, useContext } from "react";
import type { ImageUpload } from "../store/actions";
import type { Result } from "../store/store";
import type { Comment, CommentStatus, Rect, Snapshot } from "../store/types";

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
}

/** A crop being encoded: the picture arrives a moment after the comment is posted. */
export interface PendingCrop {
  blob: Promise<Blob | null>;
  rect: Rect;
}

export type CaptureOutcome = { ok: true; snapshot: Snapshot } | { ok: false; message: string };

/**
 * Everything the viewer changes, behind one interface: the owner's local
 * store, or a shared link's server. The role decides which controls show;
 * client implementations refuse the owner-only calls anyway.
 */
export interface ViewerBackend {
  role: ViewerRole;
  /**
   * Resolves once the comment is saved (the owner's store) or accepted by the
   * server (a shared link). On failure nothing is lost: the caller keeps the draft.
   */
  addComment(input: NewComment, crop: PendingCrop | null): Promise<Result<Comment>>;
  setAuthorName(name: string): void;
  setCommentStatus(id: string, status: CommentStatus): Result;
  editComment(id: string, body: string): Result;
  deleteComment(id: string): Result;
  restoreComment(comment: Comment): Result;
  replaceWithImage(
    projectId: string,
    image: ImageUpload,
    referenceUrl: string | undefined,
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

export const ViewerBackendContext = createContext<ViewerBackend | null>(null);

export function useViewerBackend(): ViewerBackend {
  const backend = useContext(ViewerBackendContext);
  if (!backend) throw new Error("Viewer rendered without a backend.");
  return backend;
}
