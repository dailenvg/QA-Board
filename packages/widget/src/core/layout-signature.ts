import type { RectLike, Size } from "./geometry";

export interface SignatureInput {
  viewport: Size;
  visual: { width: number; height: number; offsetTop: number } | null;
  points: ReadonlyArray<{ x: number; y: number; detached: boolean }>;
  rects: ReadonlyArray<RectLike | null | undefined>;
}

/** Half-pixel precision: finer movement is invisible and only causes renders. */
function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Compact string of everything the overlay positions; equal strings mean nothing moved. */
export function layoutSignature({ viewport, visual, points, rects }: SignatureInput): string {
  const parts: number[] = [viewport.width, viewport.height];
  if (visual) parts.push(round(visual.width), round(visual.height), round(visual.offsetTop));
  for (const point of points) parts.push(round(point.x), round(point.y), point.detached ? 1 : 0);
  for (const rect of rects) {
    if (rect) parts.push(round(rect.left), round(rect.top), round(rect.width), round(rect.height));
    else parts.push(-1);
  }
  return parts.join(",");
}
