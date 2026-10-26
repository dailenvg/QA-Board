import { useSyncExternalStore } from "react";
import { IDLE_SLEEP_MS, INPUT_THROTTLE_MS } from "./mood-engine";

export interface Activity {
  /** There has been pointer, keyboard, touch or wheel input in this visit. */
  engaged: boolean;
  /** No input for `IDLE_SLEEP_MS`. */
  asleep: boolean;
}

const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"] as const;
const LISTEN = { passive: true, capture: true } as const;
const AT_REST: Activity = { engaged: false, asleep: false };

const listeners = new Set<() => void>();
let snapshot: Activity = AT_REST;
let lastInput = 0;
let timer = 0;

function publish(next: Activity): void {
  if (next.engaged === snapshot.engaged && next.asleep === snapshot.asleep) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Falls asleep once input has been quiet long enough; otherwise checks again when it could be. */
function checkIdle(): void {
  const left = lastInput + IDLE_SLEEP_MS - Date.now();
  if (left > 0) {
    timer = window.setTimeout(checkIdle, left);
    return;
  }
  timer = 0;
  publish({ ...snapshot, asleep: true });
}

function onInput(): void {
  const now = Date.now();
  const awake = snapshot.engaged && !snapshot.asleep;
  if (awake && now - lastInput < INPUT_THROTTLE_MS) return;
  lastInput = now;
  publish({ engaged: true, asleep: false });
  if (!timer) timer = window.setTimeout(checkIdle, IDLE_SLEEP_MS);
}

/** Listens on the window while anything subscribes; the idle clock starts with the first. */
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, LISTEN);
    lastInput = Date.now();
    publish({ ...snapshot, asleep: false });
    timer = window.setTimeout(checkIdle, IDLE_SLEEP_MS);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, LISTEN);
    window.clearTimeout(timer);
    timer = 0;
  };
}

/** Whether the person has done anything yet this visit, and whether they've gone quiet. */
export function useActivity(): Activity {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => AT_REST,
  );
}
