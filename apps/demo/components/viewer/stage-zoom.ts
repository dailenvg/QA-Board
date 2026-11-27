/**
 * The stage's zoom: "fit" (the surface fills the stage's width, never upscaled), or a level
 * relative to the surface's own px, 1 being 100%.
 */
export type Zoom = "fit" | number;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** What zoom in and zoom out step through. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

/** A step within 1% of the level is no step at all: it moves on to the next one. */
const STEP_TOLERANCE = 1.01;

/** How strongly a wheel's pixels zoom: 100 px (a mouse wheel's notch) is about 22%. */
const WHEEL_RATE = 0.002;
/** The most one wheel event may move, so a fast flick or a line-mode wheel isn't a leap. */
const WHEEL_MAX_PX = 100;
/** Line-mode and page-mode wheels (Firefox on some mice) in px. */
const LINE_PX = 16;
const PAGE_PX = 800;

export function clampZoom(level: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
}

/** The level the stage shows now: the zoom, or at Fit the fit's own level (null: not measured). */
export function effectiveZoom(zoom: Zoom, fitLevel: number | null): number | null {
  return zoom === "fit" ? fitLevel : zoom;
}

/** The next step above `level`; null at the top. */
export function zoomStepUp(level: number): number | null {
  return ZOOM_STEPS.find((step) => step > level * STEP_TOLERANCE) ?? null;
}

/** The next step below `level`; null at the bottom (or below it, as Fit can be on a big image). */
export function zoomStepDown(level: number): number | null {
  return ZOOM_STEPS.findLast((step) => step < level / STEP_TOLERANCE) ?? null;
}

/**
 * The level a Cmd/Ctrl+wheel (or a trackpad's pinch) leads to from `level`: continuous and
 * multiplicative, so a pinch feels the same at 30% as at 300%. Null when it can't move that
 * way: at a limit, or zooming out from a Fit already below the smallest level.
 */
export function wheelZoom(level: number, deltaY: number, deltaMode = 0): number | null {
  const px = deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1);
  const capped = Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px));
  if (capped === 0) return null;
  const next = clampZoom(level * Math.exp(-capped * WHEEL_RATE));
  const zoomingIn = capped < 0;
  if (zoomingIn ? next <= level : next >= level) return null;
  return next;
}

/** "100%", or "Fit" for the fit. */
export function zoomLabel(zoom: Zoom): string {
  return zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`;
}

export interface Point {
  x: number;
  y: number;
}

/** A box in client px, as from `getBoundingClientRect()`. */
export interface ZoomBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where `point` (client px) falls on the surface, as fractions of its width and height, kept on
 * the surface: a point in the stage's margin anchors the surface's nearest edge.
 */
export function anchorOn(point: Point, surface: ZoomBox): Point {
  const fraction = (offset: number, size: number) =>
    size > 0 ? Math.min(1, Math.max(0, offset / size)) : 0.5;
  return {
    x: fraction(point.x - surface.left, surface.width),
    y: fraction(point.y - surface.top, surface.height),
  };
}

/**
 * How far to scroll the stage (px, right and down) after a zoom, so the spot `anchor` (from
 * `anchorOn`, before the zoom) is back under `point`, now that the surface is drawn as `after`.
 */
export function anchorCorrection(anchor: Point, after: ZoomBox, point: Point): Point {
  return {
    x: after.left + anchor.x * after.width - point.x,
    y: after.top + anchor.y * after.height - point.y,
  };
}

/** The centre of the part of `stage` on screen, where keys and buttons zoom around. */
export function visibleCentre(stage: ZoomBox, viewport: { width: number; height: number }): Point {
  const left = Math.max(0, stage.left);
  const top = Math.max(0, stage.top);
  const right = Math.min(viewport.width, stage.left + stage.width);
  const bottom = Math.min(viewport.height, stage.top + stage.height);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}
