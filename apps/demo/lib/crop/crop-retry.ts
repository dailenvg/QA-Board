/** Tries a comment's screenshot gets, to render and then to upload, before it posts without one. */
export const CROP_ATTEMPTS = 3;

/** The wait before each retry (the second try, then the third): short, and growing. */
export const CROP_BACKOFF_MS = [500, 1_500] as const;

/** A render still unfinished after this counts as failed, so a send never waits on it forever. */
export const CROP_RENDER_TIMEOUT_MS = 5_000;

/** The wait before try `attempt` (0-based); none before the first. */
export function cropBackoff(attempt: number): number {
  if (attempt <= 0) return 0;
  return CROP_BACKOFF_MS[Math.min(attempt, CROP_BACKOFF_MS.length) - 1] ?? 0;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
