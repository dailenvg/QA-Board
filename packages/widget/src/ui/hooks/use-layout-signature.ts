import { useSyncExternalStore } from "react";
import { createFrameScheduler } from "../../core/frame-scheduler";

const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

/**
 * Attribute changes that can move or resize something: inline styles (which
 * is how animation libraries write transforms), classes, and visibility.
 * Everything else (aria-*, data-*, value...) is ignored.
 */
const LAYOUT_ATTRIBUTES = ["style", "class", "hidden", "open"];

function start(): () => void {
  const scheduler = createFrameScheduler(() => {
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
    characterData: true,
    attributeFilter: LAYOUT_ATTRIBUTES,
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

/**
 * Subscribes to scroll, resize, navigation and layout-relevant DOM mutation.
 * Bursts are coalesced: listeners run at most once per animation frame.
 */
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

/**
 * Re-renders only when `measure()` returns a different string. Measure what
 * the overlay actually draws (pin positions, the outline target, the visual
 * viewport) so a host animation that moves nothing we show costs no render.
 */
export function useLayoutSignature(measure: () => string): string {
  return useSyncExternalStore(subscribeToLayout, measure, () => "");
}
