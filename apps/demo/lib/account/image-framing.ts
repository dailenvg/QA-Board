import {
  IMAGE_MAX_EDGE,
  IMAGE_MIN_EDGE,
  IMAGE_TOO_SMALL,
  isTooLong,
  LOGO_TOO_LONG,
  type ImageKind,
} from "./image-rules";

/**
 * The crop step before an avatar or logo uploads: how far a picked image can
 * zoom, where it can move, and what Save draws. All in frame units: the
 * square frame's side is 1, a `scale` is frame sides per source pixel, and
 * `x` / `y` are how far the image's centre sits from the frame's, in frame
 * sides (positive: right, down).
 */

export interface SourceSize {
  width: number;
  height: number;
}

export interface Framing {
  scale: number;
  x: number;
  y: number;
}

export interface ZoomRange {
  /** The smallest scale: Fit for a logo (whole, inside the padding), Fill for an avatar. */
  min: number;
  /** Covers the frame: the shorter edge meets it. */
  fill: number;
  max: number;
}

/**
 * The room left around a logo at Fit, on each side, as a share of the frame.
 * 15%, not less: a square logo's corners then sit just inside the circle a
 * guest link shows it in (a 70% square's half-diagonal is 0.495 of the frame),
 * so Fit shows the whole logo in every place it appears, round or square.
 */
export const LOGO_FIT_PADDING = 0.15;

/** Zooming in stops at this many times Fill… */
export const ZOOM_MAX_FILL = 4;

/**
 * …or once the frame covers this few source pixels, whichever comes first
 * (never before Fill): closer in, the stored image is too soft for the
 * largest tile it's shown in.
 */
export const ZOOM_MIN_SOURCE = 128;

/** The size slider's steps from `min` to `max`, spaced evenly in ratio, not in scale. */
export const ZOOM_STEPS = 100;

/** Room to move smaller than this is rounding (a side at exactly Fill), not room. */
const PAN_EPSILON = 1e-9;

/** Why a picked image can't be cropped as `kind`, or null. Any size above that scales down. */
export function sourceSizeError(kind: ImageKind, { width, height }: SourceSize): string | null {
  if (Math.min(width, height) < IMAGE_MIN_EDGE) return IMAGE_TOO_SMALL;
  if (kind === "logo" && isTooLong(width, height)) return LOGO_TOO_LONG;
  return null;
}

export function zoomRange(kind: ImageKind, { width, height }: SourceSize): ZoomRange {
  const fill = 1 / Math.min(width, height);
  const max = Math.max(fill, Math.min(fill * ZOOM_MAX_FILL, 1 / ZOOM_MIN_SOURCE));
  const min = kind === "logo" ? (1 - 2 * LOGO_FIT_PADDING) / Math.max(width, height) : fill;
  return { min, fill, max };
}

/** Where the crop starts, and where Reset goes back to: centred at the smallest size. */
export function startFraming(range: ZoomRange): Framing {
  return { scale: range.min, x: 0, y: 0 };
}

/**
 * An offset on one axis, kept so the frame stays covered where the image is
 * larger than it (`extent`, in frame sides), and centred where it's smaller.
 */
function clampOffset(extent: number, offset: number): number {
  const room = (extent - 1) / 2;
  if (room <= PAN_EPSILON) return 0;
  return Math.min(room, Math.max(-room, offset));
}

/** Whether the image is larger than the frame on either axis, so it can be moved. */
export function canPan(size: SourceSize, framing: Framing): boolean {
  return Math.max(size.width, size.height) * framing.scale > 1 + PAN_EPSILON;
}

function clampPan(size: SourceSize, framing: Framing): Framing {
  return {
    scale: framing.scale,
    x: clampOffset(size.width * framing.scale, framing.x),
    y: clampOffset(size.height * framing.scale, framing.y),
  };
}

/** Moves the image by `dx`, `dy` frame sides, as far as it can go. */
export function panBy(size: SourceSize, framing: Framing, dx: number, dy: number): Framing {
  return clampPan(size, { ...framing, x: framing.x + dx, y: framing.y + dy });
}

/** Zooms to `scale` (held to the range) about the frame's centre. */
export function zoomTo(
  size: SourceSize,
  range: ZoomRange,
  framing: Framing,
  scale: number,
): Framing {
  const next = Math.min(range.max, Math.max(range.min, scale));
  const ratio = next / framing.scale;
  return clampPan(size, { scale: next, x: framing.x * ratio, y: framing.y * ratio });
}

/**
 * `to`, or Fill if a zoom from `from` passes it on the way: a zoom without
 * the slider's steps (the − and + buttons, a pinch, the wheel) stops there
 * once, and moves on from it at the next go.
 */
export function stopAtFill(range: ZoomRange, from: number, to: number): number {
  const passes = (from < range.fill && range.fill < to) || (to < range.fill && range.fill < from);
  return passes ? range.fill : to;
}

/** The slider step nearest `scale`. */
export function stepAtScale(range: ZoomRange, scale: number): number {
  if (range.max <= range.min) return 0;
  return Math.round((ZOOM_STEPS * Math.log(scale / range.min)) / Math.log(range.max / range.min));
}

/** The scale at a slider step: exactly Fit (a logo's step 0) and Fill at theirs. */
export function scaleAtStep(range: ZoomRange, step: number): number {
  if (step <= 0) return range.min;
  if (step >= ZOOM_STEPS) return range.max;
  if (step === stepAtScale(range, range.fill)) return range.fill;
  return range.min * (range.max / range.min) ** (step / ZOOM_STEPS);
}

/** The size as said beside the slider and to screen readers: "Fit", "Fill" or a share of Fill. */
export function zoomLabel(kind: ImageKind, range: ZoomRange, scale: number): string {
  if (kind === "logo" && scale === range.min) return "Fit";
  if (scale === range.fill) return "Fill";
  return `${Math.round((scale / range.fill) * 100)}%`;
}

/**
 * What Save draws on a `side` × `side` canvas: the part of the source inside
 * the frame (`s*`), at its place on the canvas (`d*`). Where a logo is smaller
 * than the frame, the canvas around it stays empty.
 */
export interface FramedDraw {
  side: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** One axis of a `FramedDraw`: `from` and `length` in the source, `at` and `drawn` on the canvas. */
interface AxisDraw {
  from: number;
  length: number;
  at: number;
  drawn: number;
}

/** One axis of `framedDraw`: `source` px long, `covered` px of it across the frame. */
function axisDraw(source: number, covered: number, offset: number, perPixel: number): AxisDraw {
  const start = (source - covered) / 2 - offset;
  const from = Math.max(0, start);
  const length = Math.min(source, start + covered) - from;
  return { from, length, at: (from - start) * perPixel, drawn: length * perPixel };
}

/**
 * The square Save makes from `framing`: as many pixels across as the frame
 * covers of the source, at most 512 and never under 16, framed exactly as
 * the preview shows.
 */
export function framedDraw(size: SourceSize, framing: Framing): FramedDraw {
  const covered = 1 / framing.scale;
  const side = Math.max(IMAGE_MIN_EDGE, Math.min(IMAGE_MAX_EDGE, Math.round(covered)));
  const perPixel = side / covered;
  const x = axisDraw(size.width, covered, framing.x * covered, perPixel);
  const y = axisDraw(size.height, covered, framing.y * covered, perPixel);
  return {
    side,
    sx: x.from,
    sy: y.from,
    sw: x.length,
    sh: y.length,
    dx: x.at,
    dy: y.at,
    dw: x.drawn,
    dh: y.drawn,
  };
}
