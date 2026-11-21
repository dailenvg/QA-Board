/** Work under way by key, so a second caller joins it instead of starting it again. */
export interface InFlight<T> {
  /** Starts `start` under `key`, or joins the run already there. Forgotten once it settles. */
  run: (key: string, start: () => Promise<T>) => Promise<T>;
  /** The run under way at `key`; null when there's none. */
  join: (key: string) => Promise<T> | null;
}

export function createInFlight<T>(): InFlight<T> {
  const running = new Map<string, Promise<T>>();
  return {
    run(key, start) {
      const current = running.get(key);
      if (current) return current;
      const started = start();
      running.set(key, started);
      // Attached first, so whoever awaits the run finds the key free again (for a fresh capture).
      const forget = () => {
        if (running.get(key) === started) running.delete(key);
      };
      started.then(forget, forget);
      return started;
    },
    join: (key) => running.get(key) ?? null,
  };
}

/** One snapshot: a project's site at one width (a breakpoint). */
export function captureKey(projectId: string, url: string, width: number): string {
  return JSON.stringify([projectId, url, width]);
}

/** `run`'s outcome, or null as soon as `signal` aborts: a caller leaving doesn't stop the run. */
export function unlessAborted<T>(run: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const leave = () => resolve(null);
    signal.addEventListener("abort", leave, { once: true });
    run.then(
      (value) => {
        signal.removeEventListener("abort", leave);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", leave);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
