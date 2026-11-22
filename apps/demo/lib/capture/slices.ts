import { CAPTURE_LIMITS } from "./types";

/** A band of the page in CSS px, from `y` down. */
export interface Slice {
  y: number;
  height: number;
}

/** How a page is shot: its captured height and the bands that cover it, top first. */
export interface SlicePlan {
  height: number;
  slices: Slice[];
}

/**
 * Cuts a page of `pageHeight` CSS px into viewport-tall bands, the last one
 * only as tall as what's left. Pages taller than `CAPTURE_LIMITS.maxHeight`
 * are cut off there; a page with no measurable height is one px tall.
 */
export function planSlices(pageHeight: number, viewportHeight: number): SlicePlan {
  const height = Math.max(1, Math.min(CAPTURE_LIMITS.maxHeight, Math.round(pageHeight) || 1));
  const slices: Slice[] = [];
  for (let y = 0; y < height; y += viewportHeight) {
    slices.push({ y, height: Math.min(viewportHeight, height - y) });
  }
  return { height, slices };
}

/** The bands shot, in order, and whether time ran out before the last one. */
export interface SliceShots<T> {
  shots: T[];
  /** CSS px covered by `shots`, from the top. */
  height: number;
  partial: boolean;
}

const STOPPED = Symbol("stopped");

function whenStopped(stop: AbortSignal): Promise<typeof STOPPED> {
  return new Promise((resolve) => {
    if (stop.aborted) resolve(STOPPED);
    else stop.addEventListener("abort", () => resolve(STOPPED), { once: true });
  });
}

/**
 * Shoots `slices` one by one. Once `stop` aborts, slicing ends with what's
 * been shot so far, abandoning a band still being shot. The first band is
 * always waited for: with nothing shot there's no picture to return, so only
 * the caller's own abort ends that wait.
 */
export async function shootSlices<T>(
  slices: readonly Slice[],
  shootOne: (slice: Slice, index: number) => Promise<T>,
  stop: AbortSignal,
): Promise<SliceShots<T>> {
  const shots: T[] = [];
  let height = 0;
  const stopped = whenStopped(stop);
  for (const [index, slice] of slices.entries()) {
    if (shots.length > 0 && stop.aborted) return { shots, height, partial: true };
    const shooting = shootOne(slice, index);
    if (shots.length > 0) {
      // An abandoned band's call fails once the browser closes; nothing waits for it.
      shooting.catch(() => undefined);
      const shot = await Promise.race([shooting, stopped]);
      if (shot === STOPPED) return { shots, height, partial: true };
      shots.push(shot);
    } else {
      shots.push(await shooting);
    }
    height += slice.height;
  }
  return { shots, height, partial: false };
}
