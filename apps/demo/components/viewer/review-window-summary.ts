import { spokenTimeLeft, timeLeft } from "@/lib/share/review-window";

/** "Sun, Nov 15 · 4:30 PM", in the owner's own time zone. */
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function openUntil(endsAt: number): string {
  return `${DAY.format(endsAt)} · ${TIME.format(endsAt)}`;
}

/**
 * What a link's review window means now, by the server's deadline (the window
 * starts when the link is created): when it closes and how long is left, no
 * limit, or closed and how to reopen it.
 */
export function reviewWindowSummary(endsAt: number | null, now: number): string {
  if (endsAt === null) return "No time limit. Clients can comment until you revoke the link.";
  const left = timeLeft(endsAt, now);
  return left
    ? `Open until ${openUntil(endsAt)}. Clients can comment for ${spokenTimeLeft(left)} more.`
    : "Review window closed. Clients can still read comments but can't add new ones. To reopen it, choose a longer window or No limit.";
}
