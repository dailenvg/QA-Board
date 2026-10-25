import type { Rect } from "../store/types";

/** A box in client (CSS) px, as from `getBoundingClientRect()`. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropInput {
  /** Where the surface image is drawn on screen. */
  image: Box;
  /** The part of the screen the stage shows (scroll container clipped to the window). */
  view: Box;
  /** The surface's own size: snapshot page px, or the image's natural px. */
  natural: { width: number; height: number };
  /** The pin, as a percentage of the surface. */
  pin: { x: number; y: number };
}

export interface CropPlan {
  /** Region to cut out, in surface px. */
  rect: Rect;
  /** The pin in surface px. */
  pin: { x: number; y: number };
  /** Output px per surface px (crops are scaled down to `MAX_CROP_EDGE`). */
  scale: number;
  /** Marker size in output px, matching the pin's on-screen size. */
  markerSize: number;
}

export const MAX_CROP_EDGE = 1600;
/** The pin marker is 2rem (32px) on screen. */
const MARKER_CSS_PX = 32;

function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** A `width` × `height` region centred on `point`, kept inside the surface. */
function centredOn(
  point: { x: number; y: number },
  width: number,
  height: number,
  natural: { width: number; height: number },
): Rect {
  const w = Math.min(width, natural.width);
  const h = Math.min(height, natural.height);
  const x = Math.min(Math.max(0, point.x - w / 2), natural.width - w);
  const y = Math.min(Math.max(0, point.y - h / 2), natural.height - h);
  return { x, y, width: w, height: h };
}

function rounded(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return {
    x,
    y,
    width: Math.max(1, Math.round(rect.x + rect.width) - x),
    height: Math.max(1, Math.round(rect.y + rect.height) - y),
  };
}

/**
 * The part of the surface the commenter could see when they posted. If the
 * pin has scrolled out of view, a view-sized region centred on it instead.
 */
export function planCrop({ image, view, natural, pin }: CropInput): CropPlan | null {
  if (image.width <= 0 || image.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return null;
  }
  const perX = natural.width / image.width;
  const perY = natural.height / image.height;
  const point = { x: (pin.x / 100) * natural.width, y: (pin.y / 100) * natural.height };
  const seen = intersect(image, view);
  const visible: Rect | null = seen && {
    x: (seen.left - image.left) * perX,
    y: (seen.top - image.top) * perY,
    width: seen.width * perX,
    height: seen.height * perY,
  };
  const region =
    visible && contains(visible, point)
      ? visible
      : centredOn(point, view.width * perX, view.height * perY, natural);
  const rect = rounded(region);
  const scale = Math.min(1, MAX_CROP_EDGE / Math.max(rect.width, rect.height));
  return { rect, pin: point, scale, markerSize: MARKER_CSS_PX * perX * scale };
}

/** A rect in image px as page px, for an image rendered at `scale` image px per page px. */
export function toPagePx(rect: Rect, scale: number): Rect {
  if (scale === 1) return rect;
  const x = Math.round(rect.x / scale);
  const y = Math.round(rect.y / scale);
  return {
    x,
    y,
    width: Math.max(1, Math.round((rect.x + rect.width) / scale) - x),
    height: Math.max(1, Math.round((rect.y + rect.height) / scale) - y),
  };
}
