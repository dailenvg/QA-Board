/**
 * How often an open tab reads the workspace again while it's visible, so
 * what changed elsewhere (a client's comment on a review link, above all)
 * shows without a reload. Hidden tabs don't read; they catch up when shown.
 */
export const WORKSPACE_POLL_MS = 60_000;

/** Whether the page is on screen, and when that changes. */
export interface PageVisibility {
  isVisible: () => boolean;
  /** Calls `onChange` when the page is hidden or shown again; returns how to stop. */
  subscribe: (onChange: () => void) => () => void;
}

const DOCUMENT_VISIBILITY: PageVisibility = {
  isVisible: () => document.visibilityState === "visible",
  subscribe: (onChange) => {
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  },
};

interface VisiblePollOptions {
  /** Reads again; settles once that read is done, or has failed. */
  refresh: () => Promise<void>;
  /**
   * When the last read finished (epoch ms), whoever asked for it: a read on
   * focus or after another tab's change counts, so the poll waits from it.
   */
  lastReadAt: () => number;
  intervalMs?: number;
  visibility?: PageVisibility;
}

/**
 * Calls `refresh` once `intervalMs` has passed since the last read, while the
 * page is visible: never while hidden (shown again with one due, it reads at
 * once), never while its own read is still on its way. Returns how to stop.
 */
export function startVisiblePoll({
  refresh,
  lastReadAt,
  intervalMs = WORKSPACE_POLL_MS,
  visibility = DOCUMENT_VISIBILITY,
}: VisiblePollOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  // Counted from the poll's own tries too, so a read that never lands (no connection) can't spin.
  let triedAt = Date.now();

  const dueIn = () => Math.max(lastReadAt(), triedAt) + intervalMs - Date.now();
  const idle = () => !stopped && !running && visibility.isVisible();

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    cancel();
    if (idle()) timer = setTimeout(tick, Math.max(0, dueIn()));
  };

  function tick(): void {
    timer = undefined;
    if (!idle()) return;
    if (dueIn() > 0) {
      schedule();
      return;
    }
    running = true;
    triedAt = Date.now();
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        running = false;
        schedule();
      });
  }

  const stopListening = visibility.subscribe(() => {
    if (visibility.isVisible()) tick();
    else cancel();
  });
  schedule();

  return () => {
    stopped = true;
    cancel();
    stopListening();
  };
}
