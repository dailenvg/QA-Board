import type { Rect } from "@/lib/store/types";

/** How much of a crop a card's thumbnail shows, in surface px. Its 3:2 is the thumbnail's aspect. */
export const CROP_WINDOW = { width: 480, height: 320 } as const;

const BOX_ASPECT = CROP_WINDOW.width / CROP_WINDOW.height;

/** Where to draw the whole crop, as percentages of the thumbnail box. */
export interface CropFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Places a comment's crop in its 3:2 thumbnail box so the box shows a
 * `CROP_WINDOW` of it centred on the pin, kept inside the crop, scaled to fit.
 * In a dimension where the crop is smaller than the window, the whole extent
 * shows (centred, with room either side). Without a pin (`pin` null, as when
 * the surface's size isn't known), the whole crop shows. `pin` is in surface
 * px, like `rect`.
 */
export function cropFrame(rect: Rect, pin: { x: number; y: number } | null): CropFrame {
  const width = pin ? Math.min(CROP_WINDOW.width, rect.width) : rect.width;
  const height = pin ? Math.min(CROP_WINDOW.height, rect.height) : rect.height;
  const windowX = pin ? clamp(pin.x - rect.x - width / 2, 0, rect.width - width) : 0;
  const windowY = pin ? clamp(pin.y - rect.y - height / 2, 0, rect.height - height) : 0;
  // The smallest 3:2 box around the window, in surface px; the window sits in its middle.
  const boxWidth = Math.max(width, height * BOX_ASPECT);
  const boxHeight = boxWidth / BOX_ASPECT;
  const left = (boxWidth - width) / 2 - windowX;
  const top = (boxHeight - height) / 2 - windowY;
  return {
    left: (left / boxWidth) * 100,
    top: (top / boxHeight) * 100,
    width: (rect.width / boxWidth) * 100,
    height: (rect.height / boxHeight) * 100,
  };
}
