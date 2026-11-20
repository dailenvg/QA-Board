import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
let now = 0;

function subscribe(onChange: () => void): () => void {
  // React re-reads the snapshot after subscribing, so a stale time refreshes on mount.
  now = Date.now();
  let timer = 0;
  // Ticks on the minute, when the clock's minute changes, so a countdown changes at the same moment the clock does.
  const tick = () => {
    now = Date.now();
    timer = window.setTimeout(tick, MINUTE - (now % MINUTE));
    onChange();
  };
  timer = window.setTimeout(tick, MINUTE - (now % MINUTE));
  return () => window.clearTimeout(timer);
}

function getSnapshot(): number {
  now ||= Date.now();
  return now;
}

/** Current time, refreshed as each minute starts, for relative timestamps. 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
