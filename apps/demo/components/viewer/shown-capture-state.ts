import type { CaptureState } from "@/lib/capture/use-capture";
import type { Breakpoint } from "@/lib/store/breakpoints";

const IDLE: CaptureState = { status: "idle" };

export interface CaptureContext {
  /** The breakpoint the last capture was for. */
  capturedFor: Breakpoint;
  /** The breakpoint on the stage now. */
  breakpoint: Breakpoint;
  /** That breakpoint's latest snapshot, if it has one. */
  latestId: string | null;
}

/**
 * The last capture's state as the stage shows it. A capture in flight shows on every
 * breakpoint; a failure only on the breakpoint it was for; a partial page only while the
 * snapshot it made is the latest on the stage, so a newer one from elsewhere (a sync, an
 * owner's capture a guest sees) doesn't take on its notice.
 */
export function shownCaptureState(
  last: CaptureState,
  { capturedFor, breakpoint, latestId }: CaptureContext,
): CaptureState {
  if (last.status === "failed") return capturedFor === breakpoint ? last : IDLE;
  if (last.status === "idle" && last.partial) {
    return last.partial.snapshotId === latestId ? last : IDLE;
  }
  return last;
}
