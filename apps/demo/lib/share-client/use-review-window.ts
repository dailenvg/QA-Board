import { useEffect, useState } from "react";
import { timeLeft, type TimeLeft } from "../share/review-window";
import { useNow } from "../use-now";

/** The longest delay `setTimeout` keeps; anything longer would fire at once. */
const MAX_DELAY = 2 ** 31 - 1;

export interface ReviewWindow {
  /** Null once the window has closed, and on a link without a deadline. */
  left: TimeLeft | null;
  closed: boolean;
}

/**
 * A shared link's review window: the time left until `endsAt` (null: no
 * deadline, so it never closes on its own), refreshed every minute. It closes
 * on the dot rather than up to a minute late, and at once when the server says
 * it's over (`closedByServer`), whatever this browser's clock says. A new
 * deadline (the owner changed the window) counts afresh. On the server (no
 * clock yet) it reads as open.
 */
export function useReviewWindow(endsAt: number | null, closedByServer: boolean): ReviewWindow {
  const now = useNow();
  /** The deadline this tab's timer saw pass. */
  const [endedAt, setEndedAt] = useState<number | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    const wait = endsAt - Date.now();
    if (wait > MAX_DELAY) return;
    // At once for a deadline already past (one moved earlier), before the minute's tick catches up.
    const timer = window.setTimeout(() => setEndedAt(endsAt), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  if (closedByServer || (endsAt !== null && endedAt === endsAt))
    return { left: null, closed: true };
  if (endsAt === null) return { left: null, closed: false };
  const left = timeLeft(endsAt, now);
  return { left, closed: left === null };
}
