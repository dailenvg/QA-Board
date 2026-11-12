import type { SyncPhase } from "@/lib/share-client/owner-sync";
import { reviewClosed } from "@/lib/share/review-window";
import type { ProjectShare } from "@/lib/store/types";

export interface ShareButtonState {
  /** The project has a link that still works: the button shows its dot. */
  linked: boolean;
  /** That link's review window has closed (by the server's deadline). */
  closed: boolean;
  /** The button's accessible name. */
  label: string;
}

/**
 * What the Share button says about the project's link. A link the server no
 * longer has (`gone`: revoked elsewhere, or deleted) reads as no link at all.
 * `now` is 0 before the browser has a clock: never closed then.
 */
export function shareButtonState(
  share: ProjectShare | undefined,
  phase: SyncPhase,
  now: number,
): ShareButtonState {
  const linked = Boolean(share) && phase !== "gone";
  const closed = Boolean(linked && share && now && reviewClosed(share.reviewEndsAt, now));
  if (!linked) return { linked, closed, label: "Share" };
  const label = `Share, link is on${closed ? ", review window closed" : ""}`;
  return { linked, closed, label };
}
