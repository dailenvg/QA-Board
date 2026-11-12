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
  /** Its tooltip: what the dot doesn't say (closed, password), if anything. */
  title: string | undefined;
}

/**
 * What the Share button says about the project's link. A link the server no
 * longer has (`gone`: revoked elsewhere, or deleted) reads as no link at all.
 * `now` is 0 before the browser has a clock: never closed then. A password
 * shows in the name and tooltip only; the dot stays the link's.
 */
export function shareButtonState(
  share: ProjectShare | undefined,
  phase: SyncPhase,
  now: number,
): ShareButtonState {
  const linked = Boolean(share) && phase !== "gone";
  const closed = Boolean(linked && share && now && reviewClosed(share.reviewEndsAt, now));
  if (!linked) return { linked, closed, label: "Share", title: undefined };
  const notes = [
    closed ? "review window closed" : null,
    share?.passwordSetAt === undefined ? null : "password protected",
  ].filter((note): note is string => note !== null);
  const label = ["Share, link is on", ...notes].join(", ");
  const title = notes.length
    ? notes.join(", ").replace(/^./, (first) => first.toUpperCase())
    : undefined;
  return { linked, closed, label, title };
}
