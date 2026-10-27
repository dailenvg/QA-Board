import { SHARE_LIMITS } from "../share/limits";

/** Crops stay a tenth under the share server's limit, so one always uploads. */
export const CROP_BUDGET_BYTES = Math.floor(SHARE_LIMITS.blobBytes.crop * 0.9);
/** JPEG qualities, tried in turn before the crop is drawn smaller. */
export const CROP_QUALITIES = [0.85, 0.72, 0.6] as const;
/** A crop is never drawn with a longest edge under this (unless it was planned smaller). */
export const MIN_CROP_EDGE = 480;
/** Each downscale shrinks the sides by at least this much, so the steps always converge. */
const MAX_SHRINK = 0.85;
/** Aim a little under the budget when sizing a smaller drawing from the last one's bytes. */
const SHRINK_MARGIN = 0.9;

/** One way to encode a crop: `scale` of its planned output size, at a JPEG `quality`. */
export interface CropStep {
  scale: number;
  quality: number;
}

export const FIRST_CROP_STEP: CropStep = { scale: 1, quality: CROP_QUALITIES[0] };

/**
 * What to try after an encoding of `size` bytes came out over `budget`: the
 * next lower quality, then (at the lowest) a smaller drawing. Bytes grow with
 * area, so the sides shrink by the square root of the overshoot. `edge` is the
 * planned longest edge in px. Null when the crop can't get any smaller.
 */
export function nextCropStep(
  step: CropStep,
  size: number,
  edge: number,
  budget = CROP_BUDGET_BYTES,
): CropStep | null {
  const lower = CROP_QUALITIES.find((quality) => quality < step.quality);
  if (lower !== undefined) return { scale: step.scale, quality: lower };
  const minScale = Math.min(1, MIN_CROP_EDGE / edge);
  if (step.scale <= minScale) return null;
  const shrink = Math.min(MAX_SHRINK, Math.sqrt(budget / size) * SHRINK_MARGIN);
  return { scale: Math.max(minScale, step.scale * shrink), quality: step.quality };
}

/**
 * Encodes with `encode`, stepping quality and then size down until the blob
 * fits `budget`. Null when the encoder fails or nothing fits.
 */
export async function encodeWithinBudget(
  encode: (step: CropStep) => Promise<Blob | null>,
  edge: number,
  budget = CROP_BUDGET_BYTES,
): Promise<Blob | null> {
  let step: CropStep | null = FIRST_CROP_STEP;
  while (step) {
    const blob = await encode(step);
    if (!blob) return null;
    if (blob.size <= budget) return blob;
    step = nextCropStep(step, blob.size, edge, budget);
  }
  return null;
}
