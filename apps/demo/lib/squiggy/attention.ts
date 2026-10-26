import { useEffect, useSyncExternalStore, type FocusEvent } from "react";

/** The New project controls Squiggy listens to. */
export type AttentionSource = "hero-button" | "sidebar-button" | "new-project-dialog";

/**
 * How a source holds attention. Tracked separately, so moving the mouse off
 * a button doesn't cancel the keyboard focus still on it (and vice versa).
 */
export type AttentionChannel = "hover" | "focus" | "open";

const listeners = new Set<() => void>();
const active = new Set<`${AttentionSource}:${AttentionChannel}`>();
let listening = false;

/** Notes that `source` has (or no longer has) the person's attention through `channel`. */
export function setSquiggyAttention(
  source: AttentionSource,
  on: boolean,
  channel: AttentionChannel = "open",
): void {
  const key = `${source}:${channel}` as const;
  if (on) active.add(key);
  else active.delete(key);
  if (listening === active.size > 0) return;
  listening = !listening;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while any New project control is hovered, keyboard-focused or open. */
export function useSquiggyAttention(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => listening,
    () => false,
  );
}

export interface AttentionHandlers {
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}

/**
 * Handlers for a `motion` control (its hover events ignore touch). Focus
 * counts only when it's visible: a click, or focus returning after a dialog
 * closes, isn't someone tabbing to it. Lets go when the control unmounts.
 */
export function useAttentionReporter(source: AttentionSource): AttentionHandlers {
  useEffect(
    () => () => {
      setSquiggyAttention(source, false, "hover");
      setSquiggyAttention(source, false, "focus");
    },
    [source],
  );
  return {
    onHoverStart: () => setSquiggyAttention(source, true, "hover"),
    onHoverEnd: () => setSquiggyAttention(source, false, "hover"),
    onFocus: (event) => {
      if (event.currentTarget.matches(":focus-visible")) {
        setSquiggyAttention(source, true, "focus");
      }
    },
    onBlur: () => setSquiggyAttention(source, false, "focus"),
  };
}

/** Reports `source` while `on` is true, such as a dialog while it's open. */
export function useAttentionWhile(source: AttentionSource, on: boolean): void {
  useEffect(() => {
    setSquiggyAttention(source, on);
    return () => setSquiggyAttention(source, false);
  }, [source, on]);
}
