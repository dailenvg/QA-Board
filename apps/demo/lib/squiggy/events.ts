/**
 * Things Squiggy reacts to, emitted by the store's action layer
 * (`lib/store/actions.ts`) after a change is saved, or when a save is refused.
 * Undo restores emit nothing.
 */
export type SquiggyEvent =
  | { type: "comment-resolved" }
  | { type: "project-created"; projectName: string }
  | { type: "item-deleted"; item: "project" | "folder" | "comment" }
  | { type: "save-failed" };

export type SquiggyEventType = SquiggyEvent["type"];

/** The latest event and when it happened (ms since the epoch). */
export interface SquiggyEventRecord {
  event: SquiggyEvent;
  at: number;
}

type Listener = (record: SquiggyEventRecord) => void;

const listeners = new Set<Listener>();
let latest: SquiggyEventRecord | null = null;

/** Tells every listener. Never throws back into the action that emitted it. */
export function emitSquiggy(event: SquiggyEvent): void {
  const record = { event, at: Date.now() };
  latest = record;
  for (const listener of listeners) {
    try {
      listener(record);
    } catch (error) {
      console.error(error);
    }
  }
}

/** Calls `listener` on every event from now on. Returns the unsubscribe. */
export function onSquiggy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The most recent event in this visit, so a Squiggy mounted just after it (a
 * resolve, then straight back to the Overview) can still react.
 */
export function latestSquiggyEvent(): SquiggyEventRecord | null {
  return latest;
}
