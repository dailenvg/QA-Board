import type { ImageUpload } from "@/lib/store/actions";
import type { CommentPriority } from "@/lib/store/types";
import type { ReadyCrop } from "@/lib/viewer-backend/backend";

export type ViewerMode = "browse" | "comment";
export type CommentTab = "active" | "resolved";

/**
 * Where a send is: posting, or still trying to render the screenshot after a
 * failed try ("screenshot"). False while nothing is being sent.
 */
export type SendStep = false | "posting" | "screenshot";

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
  /** Sending is under way, and which step it's on. */
  sending: SendStep;
  /** Why the last post failed. The draft and its text stay until it goes through. */
  error: string | null;
  /**
   * The screenshot rendered on an earlier try, reused by retries. Null until
   * one rendered: a retry (or a draft restored after a reload) takes it again.
   */
  crop: ReadyCrop | null;
  /** The name typed in this draft, kept with it (a reload restores both). */
  author?: string;
  /** The priority picked in this draft (missing for none), kept with it like the name. */
  priority?: CommentPriority;
  /**
   * The team's: kept to the team (057). Off for every new draft (D15), and kept with this one
   * like its priority, so a reload never posts it for clients to see.
   */
  teamOnly?: boolean;
}

/** Saves an uploaded screenshot as the project's image; resolves to an error message, or null. */
export type ScreenshotHandler = (image: ImageUpload) => Promise<string | null>;
