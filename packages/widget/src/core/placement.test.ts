import { describe, expect, it } from "vitest";
import { placePopover } from "./placement";

const size = { width: 300, height: 200 };
const anchorAt = (left: number, top: number) => ({ left, top, width: 28, height: 28 });

describe("placePopover", () => {
  it("places below and left-aligned when there is room", () => {
    const viewport = { width: 1280, height: 800 };
    expect(placePopover({ anchor: anchorAt(100, 100), size, viewport })).toEqual({
      x: 100,
      y: 138,
      side: "bottom",
    });
  });

  it("flips above when there is no room below", () => {
    const viewport = { width: 1280, height: 800 };
    const placement = placePopover({ anchor: anchorAt(100, 700), size, viewport });
    expect(placement.side).toBe("top");
    expect(placement.y).toBe(700 - 10 - 200);
  });

  it("right-aligns near the right edge", () => {
    const viewport = { width: 1280, height: 800 };
    expect(placePopover({ anchor: anchorAt(1200, 100), size, viewport }).x).toBe(1228 - 300);
  });

  it("stays inside a 375px viewport", () => {
    const viewport = { width: 375, height: 667 };
    const narrow = { width: 351, height: 420 };
    for (const left of [0, 60, 180, 340]) {
      for (const top of [0, 200, 400, 640]) {
        const { x, y } = placePopover({ anchor: anchorAt(left, top), size: narrow, viewport });
        expect(x).toBeGreaterThanOrEqual(12);
        expect(x + narrow.width).toBeLessThanOrEqual(375 - 12);
        expect(y).toBeGreaterThanOrEqual(12);
        expect(y + narrow.height).toBeLessThanOrEqual(667 - 12);
      }
    }
  });

  it("pins to the margin when the popover is taller than the viewport", () => {
    const viewport = { width: 375, height: 300 };
    expect(
      placePopover({ anchor: anchorAt(10, 150), size: { width: 351, height: 500 }, viewport }).y,
    ).toBe(12);
  });
});
