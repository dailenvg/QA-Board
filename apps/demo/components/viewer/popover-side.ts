/** Space kept between the popover and the stage's edges, in px. */
const MARGIN = 8;
/** The pin button's width: the popover starts just past it on the right. */
const PIN_WIDTH = 44;
/** How far above the pin's point its marker's top sits. */
const PIN_HEAD = 36;

/** A box's edges in window px, as `getBoundingClientRect` gives them. */
export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PopoverSide {
  horizontal: "right" | "left";
  vertical: "down" | "up";
  /** Px slid sideways to stay inside the stage when neither side has the popover's width. */
  shift: number;
  /**
   * The most height the popover has on its side, in px (null until measured): past it, its
   * body scrolls, so the header (Copy link, Close) and the reply box stay in view.
   */
  room: number | null;
}

/**
 * Where the popover may go: what every box that clips the pins (the stage's scroller, a
 * website's frame) and the window all show, less a margin.
 */
export function visibleBounds(
  clips: readonly Edges[],
  viewport: { width: number; height: number },
): Edges {
  const onScreen = { top: 0, right: viewport.width, bottom: viewport.height, left: 0 };
  const shown = clips.reduce<Edges>(
    (bounds, clip) => ({
      top: Math.max(bounds.top, clip.top),
      right: Math.min(bounds.right, clip.right),
      bottom: Math.min(bounds.bottom, clip.bottom),
      left: Math.max(bounds.left, clip.left),
    }),
    onScreen,
  );
  return {
    top: shown.top + MARGIN,
    right: shown.right - MARGIN,
    bottom: shown.bottom - MARGIN,
    left: shown.left + MARGIN,
  };
}

/**
 * The side of the pin (at `anchor`, in window px) with room for the popover's `size` inside
 * `bounds`, else the side with more room, slid sideways as far as it takes to keep it inside,
 * with its height capped to the room there so its top never runs out of view.
 */
export function popoverSide(
  bounds: Edges,
  anchor: { x: number; y: number },
  size: { width: number; height: number },
): PopoverSide {
  const roomRight = bounds.right - (anchor.x + PIN_WIDTH);
  const roomLeft = anchor.x - MARGIN - bounds.left;
  const roomDown = bounds.bottom - (anchor.y - PIN_HEAD);
  const roomUp = anchor.y + MARGIN - bounds.top;
  const horizontal = roomRight >= size.width || roomRight >= roomLeft ? "right" : "left";
  const start = horizontal === "right" ? anchor.x + PIN_WIDTH : anchor.x - MARGIN - size.width;
  // The left edge wins: on a stage narrower than the popover, its start stays in view.
  const clamped = Math.max(bounds.left, Math.min(start, bounds.right - size.width));
  const vertical = roomDown >= size.height || roomDown >= roomUp ? "down" : "up";
  const room = vertical === "down" ? roomDown : roomUp;
  return {
    horizontal,
    vertical,
    shift: Math.round(clamped - start),
    room: Math.max(0, Math.floor(room)),
  };
}
