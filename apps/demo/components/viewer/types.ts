import type { ImageUpload } from "@/lib/store/actions";

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
}

/** Saves an uploaded screenshot as the project's image; resolves to an error message, or null. */
export type ScreenshotHandler = (image: ImageUpload) => Promise<string | null>;
