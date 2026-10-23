export interface FrameScheduler {
  schedule: () => void;
  cancel: () => void;
}

/** Coalesces bursts of events (scroll, resize, mutations) into one callback per frame. */
export function createFrameScheduler(callback: () => void): FrameScheduler {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        callback();
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
