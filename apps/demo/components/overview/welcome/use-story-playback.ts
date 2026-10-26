import { useReducedMotion } from "motion/react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useDocumentVisible } from "@/lib/use-document-visible";

/** Remembers Pause for the visit (the tab's session), across reloads and navigation. */
const PAUSED_KEY = "squint:welcome-stories-paused";

const listeners = new Set<() => void>();
/** Read once from sessionStorage; also the fallback where storage is unavailable. */
let pausedCache: boolean | null = null;

function readPaused(): boolean {
  if (pausedCache === null) {
    try {
      pausedCache = sessionStorage.getItem(PAUSED_KEY) === "1";
    } catch {
      pausedCache = false;
    }
  }
  return pausedCache;
}

function writePaused(paused: boolean): void {
  pausedCache = paused;
  try {
    if (paused) sessionStorage.setItem(PAUSED_KEY, "1");
    else sessionStorage.removeItem(PAUSED_KEY);
  } catch {
    // Storage blocked: the choice still holds until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface StoryPlayback {
  /** The person chose Pause (WCAG 2.2.2). */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** Reduced motion: no loops at all, and no Pause button to offer. */
  reduced: boolean;
  /** Show finished frames: reduced motion, or paused before anything played. */
  still: boolean;
  /** Stories may run (each still waits until it's on screen). */
  running: boolean;
}

/** Whether the welcome stories play: the Pause choice, reduced motion and tab visibility. */
export function useStoryPlayback(): StoryPlayback {
  const reduced = useReducedMotion() ?? false;
  const visible = useDocumentVisible();
  const paused = useSyncExternalStore(subscribe, readPaused, () => false);
  // Paused from the start (a reload after choosing Pause): show what each story ends on,
  // not its blank first frame. Once played, Pause freezes wherever the story is.
  const [played, setPlayed] = useState(() => !readPaused());

  const setPaused = useCallback((next: boolean) => {
    if (!next) setPlayed(true);
    writePaused(next);
  }, []);

  return {
    paused,
    setPaused,
    reduced,
    still: reduced || (paused && !played),
    running: visible && !paused && !reduced,
  };
}
