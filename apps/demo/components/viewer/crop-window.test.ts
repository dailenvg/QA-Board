import { describe, expect, it } from "vitest";
import type { Rect } from "@/lib/store/types";
import { cropFrame, type CropFrame } from "./crop-window";

function expectFrame(actual: CropFrame, expected: CropFrame) {
  expect(actual.left).toBeCloseTo(expected.left, 6);
  expect(actual.top).toBeCloseTo(expected.top, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

/** Where a surface point lands in the thumbnail box, as percentages of it. */
function inBox(frame: CropFrame, rect: Rect, point: { x: number; y: number }) {
  return {
    x: frame.left + ((point.x - rect.x) / rect.width) * frame.width,
    y: frame.top + ((point.y - rect.y) / rect.height) * frame.height,
  };
}

const WIDE: Rect = { x: 200, y: 100, width: 1600, height: 1000 };

describe("cropFrame", () => {
  it("shows a 480 by 320 window with the pin in the middle of the box", () => {
    const pin = { x: 1000, y: 600 };
    const frame = cropFrame(WIDE, pin);
    expectFrame(frame, {
      left: (-560 / 480) * 100,
      top: (-340 / 320) * 100,
      width: (1600 / 480) * 100,
      height: (1000 / 320) * 100,
    });
    const at = inBox(frame, WIDE, pin);
    expect(at.x).toBeCloseTo(50, 6);
    expect(at.y).toBeCloseTo(50, 6);
  });

  it("keeps the window inside the crop when the pin is near an edge", () => {
    const topLeft = cropFrame(WIDE, { x: 210, y: 110 });
    expect(topLeft.left).toBeCloseTo(0, 6);
    expect(topLeft.top).toBeCloseTo(0, 6);

    const bottomRight = cropFrame(WIDE, { x: 1790, y: 1090 });
    expect(bottomRight.left + bottomRight.width).toBeCloseTo(100, 6);
    expect(bottomRight.top + bottomRight.height).toBeCloseTo(100, 6);
    // Off centre, but still in the box.
    const at = inBox(bottomRight, WIDE, { x: 1790, y: 1090 });
    expect(at.x).toBeGreaterThan(50);
    expect(at.x).toBeLessThanOrEqual(100);
  });

  it("shows the whole width of a crop narrower than the window, centred", () => {
    const narrow: Rect = { x: 0, y: 0, width: 300, height: 1000 };
    expectFrame(cropFrame(narrow, { x: 150, y: 500 }), {
      left: (90 / 480) * 100,
      top: (-340 / 320) * 100,
      width: (300 / 480) * 100,
      height: (1000 / 320) * 100,
    });
  });

  it("shows the whole height of a crop shorter than the window, centred", () => {
    const short: Rect = { x: 0, y: 0, width: 1600, height: 200 };
    expectFrame(cropFrame(short, { x: 800, y: 100 }), {
      left: (-560 / 480) * 100,
      top: (60 / 320) * 100,
      width: (1600 / 480) * 100,
      height: (200 / 320) * 100,
    });
  });

  it("fills the box with a small 3:2 crop", () => {
    const small: Rect = { x: 40, y: 40, width: 240, height: 160 };
    expectFrame(cropFrame(small, { x: 100, y: 100 }), { left: 0, top: 0, width: 100, height: 100 });
  });

  it("fits the whole crop in the box without a pin", () => {
    const crop: Rect = { x: 0, y: 0, width: 1600, height: 800 };
    expectFrame(cropFrame(crop, null), { left: 0, top: 12.5, width: 100, height: 75 });
  });
});
