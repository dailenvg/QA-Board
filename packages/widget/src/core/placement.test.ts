import { describe, expect, it } from "vitest";
import { isSheetViewport, placePopover, scrollToClear, sheetMetrics } from "./placement";

const size = { width: 300, height: 200 };
const anchorAt = (left: number, top: number) => ({ left, top, width: 28, height: 28 });

describe("placePopover", () => {
  it("places below and left-aligned when there is room", () => {
    const viewport = { width: 1280, height: 800 };
    expect(placePopover({ anchor: anchorAt(100, 100), size, viewport })).toEqual({
      x: 100,
      y: 136,
      side: "bottom",
    });
  });

  it("flips above when there is no room below", () => {
    const viewport = { width: 1280, height: 800 };
    const placement = placePopover({ anchor: anchorAt(100, 700), size, viewport });
    expect(placement.side).toBe("top");
    expect(placement.y).toBe(700 - 8 - 200);
  });

  it("right-aligns near the right edge", () => {
    const viewport = { width: 1280, height: 800 };
    expect(placePopover({ anchor: anchorAt(1200, 100), size, viewport }).x).toBe(1228 - 300);
  });

  it("stays inside a 375px viewport", () => {
    const viewport = { width: 375, height: 667 };
    const narrow = { width: 343, height: 420 };
    for (const left of [0, 60, 180, 340]) {
      for (const top of [0, 200, 400, 640]) {
        const { x, y } = placePopover({ anchor: anchorAt(left, top), size: narrow, viewport });
        expect(x).toBeGreaterThanOrEqual(16);
        expect(x + narrow.width).toBeLessThanOrEqual(375 - 16);
        expect(y).toBeGreaterThanOrEqual(16);
        expect(y + narrow.height).toBeLessThanOrEqual(667 - 16);
      }
    }
  });

  it("pins to the margin when the popover is taller than the viewport", () => {
    const viewport = { width: 375, height: 300 };
    expect(
      placePopover({ anchor: anchorAt(10, 150), size: { width: 343, height: 500 }, viewport }).y,
    ).toBe(16);
  });
});

describe("bottom sheet", () => {
  it("is used below 480px", () => {
    expect(isSheetViewport(375)).toBe(true);
    expect(isSheetViewport(479)).toBe(true);
    expect(isSheetViewport(480)).toBe(false);
  });

  it("sits one gutter above the bottom without a keyboard", () => {
    expect(sheetMetrics(800, { height: 800, offsetTop: 0 })).toEqual({ bottom: 8, maxHeight: 784 });
    expect(sheetMetrics(800, null)).toEqual({ bottom: 8, maxHeight: 784 });
  });

  it("lifts above the on-screen keyboard and fits the visible area", () => {
    expect(sheetMetrics(800, { height: 460, offsetTop: 0 })).toEqual({
      bottom: 348,
      maxHeight: 444,
    });
  });

  it("accounts for a visual viewport scrolled within the layout viewport", () => {
    expect(sheetMetrics(800, { height: 460, offsetTop: 200 })).toEqual({
      bottom: 148,
      maxHeight: 444,
    });
  });

  it("computes how far to scroll a pin clear of the sheet", () => {
    const pin = { left: 0, top: 500, width: 28, height: 28 };
    expect(scrollToClear(pin, 600)).toBe(0);
    expect(scrollToClear(pin, 520)).toBe(16);
  });
});
