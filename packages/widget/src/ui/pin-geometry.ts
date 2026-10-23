import type { Point, RectLike } from "../core/geometry";

/** Visible badge size; the badge's square bottom-left corner sits on the anchor point. */
export const BADGE_SIZE = 28;
/** Padding that grows the badge's hit area to 44px. */
const HIT_PADDING = 8;

/** Transform for the 44px pin button so the badge tip lands exactly on `point`. */
export function pinTransform(point: Point): string {
  return `translate(${point.x - HIT_PADDING}px, ${point.y - BADGE_SIZE - HIT_PADDING}px)`;
}

/** Rect of the visible badge, used to place popovers next to it. */
export function badgeRect(point: Point): RectLike {
  return { left: point.x, top: point.y - BADGE_SIZE, width: BADGE_SIZE, height: BADGE_SIZE };
}
