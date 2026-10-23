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
  const resolved: Required<PlacementInput> = { gap: 10, margin: 12, ...input };
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
