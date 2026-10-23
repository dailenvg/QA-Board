import { clamp, type RectLike, type Size } from "./geometry";

export interface PlacementInput {
  /** Rect of the element the popover points at, in viewport coordinates. */
  anchor: RectLike;
  /** Measured popover size. */
  size: Size;
  viewport: Size;
  gap?: number;
  margin?: number;
}

export interface Placement {
  x: number;
  y: number;
  side: "top" | "bottom";
}

function pickSide(input: Required<PlacementInput>): Placement["side"] {
  const { anchor, size, viewport, gap, margin } = input;
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  if (spaceBelow >= size.height) return "bottom";
  if (spaceAbove >= size.height) return "top";
  return spaceBelow >= spaceAbove ? "bottom" : "top";
}

/**
 * Places a popover below its anchor (flipping above when it does not fit),
 * left-aligned to the anchor (flipping to right-aligned), then clamps it so
 * it always stays inside the viewport.
 */
export function placePopover(input: PlacementInput): Placement {
  const resolved: Required<PlacementInput> = { gap: 8, margin: 16, ...input };
  const { anchor, size, viewport, gap, margin } = resolved;
  const side = pickSide(resolved);

  const preferredX =
    anchor.left + size.width + margin <= viewport.width
      ? anchor.left
      : anchor.left + anchor.width - size.width;
  const preferredY =
    side === "bottom" ? anchor.top + anchor.height + gap : anchor.top - gap - size.height;

  return {
    x: clamp(preferredX, margin, Math.max(margin, viewport.width - size.width - margin)),
    y: clamp(preferredY, margin, Math.max(margin, viewport.height - size.height - margin)),
    side,
  };
}

/** Below this width popovers become bottom sheets. */
export const SHEET_BREAKPOINT = 480;
/** Space between a sheet and the screen edges (and the keyboard). */
export const SHEET_GUTTER = 8;

export function isSheetViewport(width: number): boolean {
  return width < SHEET_BREAKPOINT;
}

export interface VisualViewportLike {
  height: number;
  offsetTop: number;
}

export interface SheetMetrics {
  /** Distance from the bottom of the layout viewport, clearing any on-screen keyboard. */
  bottom: number;
  /** Tallest the sheet may be and still fit inside the visible area. */
  maxHeight: number;
}

/**
 * Positions a bottom sheet inside the visual viewport. On mobile the
 * keyboard shrinks the visual viewport but not the layout viewport that
 * `position: fixed` uses, so the difference is lifted out of the way.
 */
export function sheetMetrics(
  layoutHeight: number,
  visual: VisualViewportLike | null,
  gutter: number = SHEET_GUTTER,
): SheetMetrics {
  const visibleTop = visual?.offsetTop ?? 0;
  const visibleHeight = visual?.height ?? layoutHeight;
  const keyboard = Math.max(0, layoutHeight - (visibleTop + visibleHeight));
  return { bottom: keyboard + gutter, maxHeight: Math.max(0, visibleHeight - 2 * gutter) };
}

/** Pixels to scroll so `rect` ends `gap` above `limitTop`; 0 when it already does. */
export function scrollToClear(
  rect: RectLike,
  limitTop: number,
  gap: number = SHEET_GUTTER,
): number {
  return Math.max(0, rect.top + rect.height + gap - limitTop);
}
