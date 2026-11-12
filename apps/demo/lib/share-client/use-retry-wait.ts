import { useCallback, useEffect, useState } from "react";
import { secondsUntil } from "./unlock";

/** How often the wait is checked, in ms: the message counts whole minutes, the button frees on time. */
const TICK_MS = 1_000;

interface Wait {
  until: number;
  now: number;
}

/**
 * A wait the server asked for (a 429's `Retry-After`): the seconds still to
 * go (0 when there's none, or it's over) and how to start one, until `until`
 * (epoch ms). Checked every second while it lasts, so whatever waits on it
 * frees up on time.
 */
export function useRetryWait(): [number, (until: number) => void] {
  const [wait, setWait] = useState<Wait | null>(null);
  const until = wait?.until ?? null;

  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setWait((current) => (current && now < current.until ? { ...current, now } : null));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [until]);

  const start = useCallback((next: number) => setWait({ until: next, now: Date.now() }), []);
  return [wait ? secondsUntil(wait.until, wait.now) : 0, start];
}
