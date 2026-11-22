import { CaptureError } from "./capture-error";
import type { StepLog } from "./step-log";
import { CAPTURE_LIMITS } from "./types";

const JPEG_QUALITY = 80;
/** Lower quality used once the image has to shrink anyway. */
const SCALED_QUALITY = 70;
/** Smallest render scale; a 2560 x 16000 page of pure noise fits at 0.5. */
export const MIN_SCALE = 0.25;

/** Encodes the page as a JPEG at `scale` (image px per page px) and `quality`. */
export type RenderJpeg = (scale: number, quality: number) => Promise<Buffer>;

/**
 * The next scale to try for an image of `bytes` at `scale`: byte count grows
 * with pixel count, so the side shrinks by the square root of the overshoot,
 * with a 10% margin, rounded down to a hundredth and never below `MIN_SCALE`.
 */
export function shrunkScale(scale: number, bytes: number): number {
  const shrink = Math.sqrt(CAPTURE_LIMITS.maxBytes / bytes) * 0.9;
  return Math.max(MIN_SCALE, Math.floor(scale * shrink * 100) / 100);
}

/**
 * The page as a JPEG of at most `CAPTURE_LIMITS.maxBytes`, so the response
 * fits a Vercel Function (4.5 MB) without relying on streaming. Full size at
 * quality 80 first; if that's too big, the scale shrinks by the measured
 * overshoot until it fits. Fails when even `MIN_SCALE` is too big.
 */
export async function shrinkToFit(
  render: RenderJpeg,
  label: string,
  log: StepLog,
): Promise<{ image: Buffer; scale: number }> {
  let scale = 1;
  let image = await render(scale, JPEG_QUALITY);
  log(`${label} x${scale} ${image.length}B`);
  while (image.length > CAPTURE_LIMITS.maxBytes && scale > MIN_SCALE) {
    scale = shrunkScale(scale, image.length);
    image = await render(scale, SCALED_QUALITY);
    log(`${label} x${scale} ${image.length}B`);
  }
  if (image.length > CAPTURE_LIMITS.maxBytes) throw new CaptureError("failed");
  return { image, scale };
}
