import { reviewClosed } from "@/lib/share/review-window";
import { openUntil } from "../viewer/review-window-summary";

/**
 * What a delete dialog warns about a share link going with what's deleted: its
 * clients lose access, and when the link's review window ends. A link counts
 * while the project has one (`Project.share`), as the Share button's dot and
 * the folder's count do: even with its window closed, clients can still open
 * it and read the comments. Writer: the words are all here.
 */

/** What's being deleted: one project, or a folder with every project inside it. */
export type DeletedPlace = "project" | "folder";

/** The review window that ends last: null when one never ends. */
function latestEnd(ends: readonly (number | null)[]): number | null {
  const dated = ends.filter((end): end is number => end !== null);
  return dated.length < ends.length ? null : Math.max(...dated);
}

const keepTogether = (text: string) => text.replace(/\s/g, "\u00a0");

/**
 * `openUntil(end)` ("Sun, Nov 15 · 4:30 PM") that a narrow dialog wraps only
 * between its date and its time: "Sun, Nov 15 ·" and "4:30 PM" each stay whole
 * (non-breaking spaces), never "Nov" on one line and "15" on the next. Not all
 * one unit: at a large text size the whole thing can be wider than the line.
 */
export function wrappableOpenUntil(end: number): string {
  const shown = openUntil(end);
  const at = shown.indexOf(" · ");
  if (at < 0) return keepTogether(shown);
  return `${keepTogether(shown.slice(0, at))}\u00a0· ${keepTogether(shown.slice(at + 3))}`;
}

function lead(count: number, place: DeletedPlace): string {
  if (place === "project") return "Clients with its share link will lose access.";
  return count === 1
    ? "Clients with the share link inside will lose access."
    : `Clients with the ${count} share links inside will lose access.`;
}

function when(end: number | null, count: number, now: number): string {
  const one = count === 1;
  if (end === null) return one ? "The link has no end date." : "At least one has no end date.";
  if (now && reviewClosed(end, now)) {
    return one
      ? `Its review window closed ${wrappableOpenUntil(end)}.`
      : `The last review window closed ${wrappableOpenUntil(end)}.`;
  }
  return one
    ? `The link is open until ${wrappableOpenUntil(end)}.`
    : `The last one is open until ${wrappableOpenUntil(end)}.`;
}

/**
 * The warning for deleting a project or folder whose links end at `ends` (one
 * `reviewEndsAt` per link; null for no limit), or null without a link. With
 * several, it names how many and the one that ends last. `now` is 0 before
 * the browser has a clock: no window reads as closed then.
 */
export function shareLinkWarning(
  ends: readonly (number | null)[],
  now: number,
  place: DeletedPlace,
): string | null {
  if (ends.length === 0) return null;
  return `${lead(ends.length, place)} ${when(latestEnd(ends), ends.length, now)}`;
}
