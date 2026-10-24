import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
let now = 0;

function subscribe(onChange: () => void): () => void {
  // React re-reads the snapshot after subscribing, so a stale time refreshes on mount.
  now = Date.now();
  const timer = window.setInterval(() => {
    now = Date.now();
    onChange();
  }, MINUTE);
  return () => window.clearInterval(timer);
}

function getSnapshot(): number {
  now ||= Date.now();
  return now;
}

/** Current time, refreshed every minute, for relative timestamps. 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
