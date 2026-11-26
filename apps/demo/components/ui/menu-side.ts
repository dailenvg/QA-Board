/** Below the trigger, or above it for a trigger at the foot of the screen. */
export type MenuPlacement = "below" | "above";

/**
 * The side a menu opens on, from the room (px) on each side of its trigger
 * and the room it `needs`: `preferred` when it fits there; else the other
 * side when it fits there; else, fitting neither (a short scroller, such as a
 * phone's docked popover), the side with more room, so less of it is cut off.
 */
export function chooseSide(
  preferred: MenuPlacement,
  room: Record<MenuPlacement, number>,
  needs: number,
): MenuPlacement {
  const other: MenuPlacement = preferred === "above" ? "below" : "above";
  if (room[preferred] >= needs) return preferred;
  if (room[other] >= needs) return other;
  return room[other] > room[preferred] ? other : preferred;
}

/** The least a capped menu keeps, in px: about three items and its padding, so it still reads as a menu. */
export const MIN_CAPPED_HEIGHT = 160;

/**
 * How tall a menu may be on `side`: null when it fits there whole (`needs`: its height plus
 * `margin`, its gap and edge room); else the room there less `margin`, never under
 * `MIN_CAPPED_HEIGHT`, so it scrolls inside itself instead of being cut off by the scroller
 * around it (a phone's docked pin popover, a short comment list).
 */
export function cappedHeight(
  side: MenuPlacement,
  room: Record<MenuPlacement, number>,
  needs: number,
  margin: number,
): number | null {
  if (room[side] >= needs) return null;
  return Math.max(MIN_CAPPED_HEIGHT, Math.floor(room[side] - margin));
}
