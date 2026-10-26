import type { ImageUpload } from "@/lib/store/actions";
import type { PendingCrop } from "@/lib/viewer-backend/backend";

export type ViewerMode = "browse" | "comment";
export type CommentTab = "active" | "resolved";

export interface PinPoint {
  x: number;
  y: number;
}

export interface Draft extends PinPoint {
  body: string;
  /** The surface the draft pin was placed on (see `surfaceKey`); it only shows there. */
  surfaceKey: string;
  snapshotId: string | null;
  /** The page the draft pin was placed on (page projects, when not on a snapshot). */
  pageId: string | null;
  /** The comment's id, fixed when the pin is placed, so a retry can't post it twice. */
  commentId: string;
  /** Posting is under way. */
  sending: boolean;
  /** Why the last post failed. The draft and its text stay until it goes through. */
  error: string | null;
  /** The screenshot taken on the first try, reused by retries. */
  crop: PendingCrop | null;
  /** The name typed in this draft, kept with it (a reload restores both). */
  author?: string;
}

/** Saves an uploaded screenshot as the project's image; resolves to an error message, or null. */
export type ScreenshotHandler = (image: ImageUpload) => Promise<string | null>;
