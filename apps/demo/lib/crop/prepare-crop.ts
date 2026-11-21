import type { PendingCrop, ReadyCrop } from "../viewer-backend/backend";
import { CROP_ATTEMPTS, CROP_RENDER_TIMEOUT_MS, cropBackoff, wait } from "./crop-retry";

/** A take of the screen: a crop being rendered, or null when there was nothing to read. */
export type TakeCrop = () => PendingCrop | null;

/**
 * `take`, only while the comment's own surface is still on stage. Retries
 * read the screen again, and the person may have moved to another page or
 * breakpoint meanwhile: that take is null (a failed try), so the comment
 * ends without a screenshot rather than with another surface's.
 */
export function onSurface(take: TakeCrop, stillShown: () => boolean): TakeCrop {
  return () => (stillShown() ? take() : null);
}

/** The render's picture, or null when it failed, threw, or took longer than `timeoutMs`. */
async function finish(pending: PendingCrop, timeoutMs: number): Promise<ReadyCrop | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const blob = await Promise.race([pending.blob.catch(() => null), late]);
    return blob ? { blob, rect: pending.rect } : null;
  } finally {
    clearTimeout(timer);
  }
}

/** One take, never throwing: a stage that can't be read counts as a failed try. */
function takeOnce(take: TakeCrop): PendingCrop | null {
  try {
    return take();
  } catch {
    return null;
  }
}

interface PrepareOptions {
  /** The first try failed and another is coming: the send is taking longer than usual. */
  onRetry?: () => void;
  timeoutMs?: number;
}

/**
 * The comment's screenshot, rendered before the comment is sent: up to
 * `CROP_ATTEMPTS` takes, each read afresh from the screen, with a short
 * backoff between them. Null once every try failed, so the comment posts
 * without one (screenshot pending). Never rejects.
 *
 * The first take happens synchronously, in this call, so it reads what the
 * commenter sees before posting re-renders or scrolls anything.
 */
export async function prepareCrop(
  take: TakeCrop,
  { onRetry, timeoutMs = CROP_RENDER_TIMEOUT_MS }: PrepareOptions = {},
): Promise<ReadyCrop | null> {
  for (let attempt = 0; attempt < CROP_ATTEMPTS; attempt += 1) {
    if (attempt === 1) onRetry?.();
    if (attempt > 0) await wait(cropBackoff(attempt));
    const pending = takeOnce(take);
    const ready = pending ? await finish(pending, timeoutMs) : null;
    if (ready) return ready;
  }
  return null;
}
