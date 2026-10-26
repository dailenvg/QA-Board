import { useSyncExternalStore } from "react";
import { latestSquiggyEvent, onSquiggy, type SquiggyEvent } from "./events";
import { activeReaction } from "./mood-engine";

const listeners = new Set<() => void>();
let current: SquiggyEvent | null = null;
let timer = 0;
let stopListening: (() => void) | null = null;

/** Shows the latest event's reaction for the rest of its time, then clears it. */
function refresh(): void {
  window.clearTimeout(timer);
  const reaction = activeReaction(latestSquiggyEvent(), Date.now());
  if (reaction) timer = window.setTimeout(refresh, reaction.remaining);
  const next = reaction?.event ?? null;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Picks up a reaction already under way (an event just before Squiggy
 * mounted), then follows new events while anything subscribes.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopListening) {
    stopListening = onSquiggy(refresh);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopListening?.();
    stopListening = null;
    window.clearTimeout(timer);
    current = null;
  };
}

/**
 * The latest event while Squiggy reacts to it (`REACTION_MS` from when it
 * happened, never longer, however late Squiggy mounts); null otherwise.
 */
export function useSquiggyReaction(): SquiggyEvent | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
