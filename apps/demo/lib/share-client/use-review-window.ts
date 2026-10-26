import { useEffect, useState } from "react";
import { timeLeft, type TimeLeft } from "../share/review-window";
import { useNow } from "../use-now";

/** The longest delay `setTimeout` keeps; anything longer would fire at once. */
const MAX_DELAY = 2 ** 31 - 1;

export interface ReviewWindow {
  /** Null once the window has closed. */
  left: TimeLeft | null;
  closed: boolean;
}

/**
 * A shared link's review window: the time left, refreshed every minute. It
 * closes on the dot rather than up to a minute late, and at once when the
 * server says it's over (`closedByServer`), whatever this browser's clock says.
 * On the server (no clock yet) it reads as open.
 */
export function useReviewWindow(endsAt: number, closedByServer: boolean): ReviewWindow {
  const now = useNow();
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const wait = endsAt - Date.now();
    if (wait <= 0 || wait > MAX_DELAY) return;
    const timer = window.setTimeout(() => setEnded(true), wait);
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  const left = closedByServer || ended ? null : timeLeft(endsAt, now);
  return { left, closed: left === null };
}
