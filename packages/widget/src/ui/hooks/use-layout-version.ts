import { useSyncExternalStore } from "react";
import { createFrameScheduler } from "../../core/frame-scheduler";

let version = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function start(): () => void {
  const scheduler = createFrameScheduler(() => {
    version += 1;
    for (const listener of listeners) listener();
  });
  const onChange = scheduler.schedule;
  const options: AddEventListenerOptions = { capture: true, passive: true };

  window.addEventListener("scroll", onChange, options);
  window.addEventListener("resize", onChange, options);
  window.addEventListener("popstate", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  window.visualViewport?.addEventListener("scroll", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  onChange();

  return () => {
    scheduler.cancel();
    observer.disconnect();
    window.removeEventListener("scroll", onChange, options);
    window.removeEventListener("resize", onChange, options);
    window.removeEventListener("popstate", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
    window.visualViewport?.removeEventListener("scroll", onChange);
  };
}

/** Subscribes to scroll, resize, navigation, and DOM mutation, throttled to one call per frame. */
export function subscribeToLayout(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) stop = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop?.();
      stop = null;
    }
  };
}

/** Increments whenever page layout may have changed; read it to re-resolve positions. */
export function useLayoutVersion(): number {
  return useSyncExternalStore(
    subscribeToLayout,
    () => version,
    () => 0,
  );
}
