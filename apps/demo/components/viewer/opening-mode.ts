import type { FrameCheckState } from "@/lib/frame-check/use-frame-check";
import type { ViewerMode } from "./types";

export interface OpeningFacts {
  website: boolean;
  /** A restored draft: it's on a comment surface, so the viewer opens there. */
  draft: boolean;
  /** Commenting is off (a shared link's closed review window). */
  locked: boolean;
  frame: FrameCheckState;
}

/**
 * The mode the viewer opens in, or null while it can't tell yet (a website's
 * frame check is still running), so it never shows Browse only to leave it.
 * A draft opens where it was written. A website that refuses framing opens on
 * its snapshot in Comment mode, since Browse can't show it; the rest open in Browse.
 */
export function openingMode({ website, draft, locked, frame }: OpeningFacts): ViewerMode | null {
  if (draft) return "comment";
  if (locked || !website) return "browse";
  if (frame.status === "checking") return null;
  return frame.result.verdict === "blocked" ? "comment" : "browse";
}
