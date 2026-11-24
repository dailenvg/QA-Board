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
