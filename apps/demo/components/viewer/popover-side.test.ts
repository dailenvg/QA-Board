import { describe, expect, it } from "vitest";
import { popoverSide, visibleBounds, type Edges } from "./popover-side";

const VIEWPORT = { width: 1280, height: 720 };
/** The stage's scroller on a two-page project: below the page strip, beside the comments. */
const STAGE: Edges = { top: 220, right: 888, bottom: 704, left: 16 };
const SIZE = { width: 304, height: 300 };

describe("visibleBounds", () => {
  it("keeps 8px inside the window without a clipping box", () => {
    expect(visibleBounds([], VIEWPORT)).toEqual({ top: 8, right: 1272, bottom: 712, left: 8 });
  });

  it("keeps inside the stage, below the page strip above it", () => {
    expect(visibleBounds([STAGE], VIEWPORT)).toEqual({
      top: 228,
      right: 880,
      bottom: 696,
      left: 24,
    });
  });

  it("keeps inside every clip and the window: a narrow frame in a stage taller than the window", () => {
    const frame: Edges = { top: 240, right: 640, bottom: 1400, left: 260 };
    const tall: Edges = { ...STAGE, bottom: 1500 };
    expect(visibleBounds([frame, tall], VIEWPORT)).toEqual({
      top: 248,
      right: 632,
      bottom: 712,
      left: 268,
    });
  });
});

describe("popoverSide", () => {
  const bounds = visibleBounds([STAGE], VIEWPORT);

  it("opens down and right of a pin with room there, its full room as the cap", () => {
    expect(popoverSide(bounds, { x: 200, y: 300 }, SIZE)).toEqual({
      horizontal: "right",
      vertical: "down",
      shift: 0,
      room: 696 - (300 - 36),
    });
  });

  it("opens up when only up has room", () => {
    const side = popoverSide(bounds, { x: 200, y: 640 }, SIZE);
    expect(side.vertical).toBe("up");
    expect(side.room).toBe(640 + 8 - 228);
  });

  it("opens left when only left has room", () => {
    expect(popoverSide(bounds, { x: 700, y: 300 }, SIZE).horizontal).toBe("left");
  });

  it("caps a popover too tall for either side to the larger room, so its top stays in view", () => {
    // Pin 14 low on page 2: 330px above, 182px below, for a popover 370px tall.
    const side = popoverSide(bounds, { x: 450, y: 550 }, { width: 304, height: 370 });
    expect(side.vertical).toBe("up");
    expect(side.room).toBe(550 + 8 - 228);
    // Its bottom sits 8px below the pin's point, so its top is the stage's top margin.
    expect(550 + 8 - (side.room ?? 0)).toBe(bounds.top);
  });

  it("stays on its side once drawn at that cap", () => {
    const anchor = { x: 450, y: 550 };
    const first = popoverSide(bounds, anchor, { width: 304, height: 370 });
    const capped = popoverSide(bounds, anchor, { width: 304, height: first.room ?? 0 });
    expect(capped).toEqual(first);
  });

  it("prefers down when the rooms tie and neither fits", () => {
    const side = popoverSide(
      { top: 0, right: 1000, bottom: 400, left: 0 },
      { x: 100, y: 214 },
      { width: 304, height: 600 },
    );
    expect(side).toMatchObject({ vertical: "down", room: 222 });
  });

  it("slides a popover wider than either side so its left edge stays in view", () => {
    const narrow: Edges = { top: 0, right: 400, bottom: 700, left: 100 };
    const side = popoverSide(narrow, { x: 200, y: 100 }, SIZE);
    expect(side.horizontal).toBe("right");
    // It would start at 244; pulled back to end at the right edge, 400 - 304 = 96, then the
    // left edge wins at 100.
    expect(side.shift).toBe(100 - 244);
  });

  it("never caps below nothing once the stage has scrolled out of the window", () => {
    const gone: Edges = { top: 300, right: 1000, bottom: 200, left: 0 };
    expect(popoverSide(gone, { x: 100, y: 250 }, SIZE)).toMatchObject({
      vertical: "down",
      room: 0,
    });
  });
});
