import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A flag that switches on when triggered and back off after `ms`. Re-triggering
 * restarts it. With `startOn`, it is on at mount and switches off `ms` later.
 */
export function useTimedFlag(ms: number, startOn = false): [boolean, () => void] {
  const [on, setOn] = useState(startOn);
  const timer = useRef<number | null>(null);
  const initial = useRef({ ms, startOn });

  useEffect(() => {
    const { ms: delay, startOn: armed } = initial.current;
    if (armed) timer.current = window.setTimeout(() => setOn(false), delay);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const trigger = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOn(true);
    timer.current = window.setTimeout(() => setOn(false), ms);
  }, [ms]);

  return [on, trigger];
}
