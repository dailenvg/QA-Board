import { describe, expect, it } from "vitest";
import {
  canPan,
  framedDraw,
  panBy,
  scaleAtStep,
  sourceSizeError,
  startFraming,
  stepAtScale,
  stopAtFill,
  zoomLabel,
  zoomRange,
  zoomTo,
  ZOOM_STEPS,
  type FramedDraw,
} from "./image-framing";
import { imageSizeError } from "./image-rules";

const WIDE = { width: 800, height: 400 };
const TALL = { width: 300, height: 900 };
const SQUARE = { width: 1000, height: 1000 };
const TINY = { width: 20, height: 20 };

function expectDraw(actual: FramedDraw, expected: FramedDraw) {
  for (const key of Object.keys(expected) as (keyof FramedDraw)[]) {
    expect(actual[key], key).toBeCloseTo(expected[key], 6);
  }
}

describe("zoomRange", () => {
  it("runs a logo from Fit (whole, padded) through Fill to 4 times Fill", () => {
    expect(zoomRange("logo", SQUARE)).toEqual({ min: 0.7 / 1000, fill: 1 / 1000, max: 4 / 1000 });
  });

  it("fits a square logo whole inside the circle a guest link crops it to", () => {
    const range = zoomRange("logo", SQUARE);
    const halfSide = (SQUARE.width * range.min) / 2;
    expect(Math.hypot(halfSide, halfSide)).toBeLessThanOrEqual(0.5);
  });

  it("fits a logo's longer edge and fills with its shorter one, either way round", () => {
    expect(zoomRange("logo", WIDE)).toMatchObject({ min: 0.7 / 800, fill: 1 / 400 });
    expect(zoomRange("logo", TALL)).toMatchObject({ min: 0.7 / 900, fill: 1 / 300 });
  });

  it("stops zooming in once the frame would cover fewer than 128 source pixels", () => {
    expect(zoomRange("logo", WIDE).max).toBe(1 / 128);
    expect(zoomRange("logo", TALL).max).toBe(1 / 128);
  });

  it("never stops before Fill, however small the source", () => {
    expect(zoomRange("logo", TINY)).toEqual({ min: 0.7 / 20, fill: 1 / 20, max: 1 / 20 });
    expect(zoomRange("avatar", TINY)).toEqual({ min: 1 / 20, fill: 1 / 20, max: 1 / 20 });
  });

  it("starts an avatar at Fill: it can never show less than covers the circle", () => {
    const range = zoomRange("avatar", { width: 900, height: 600 });
    expect(range).toEqual({ min: 1 / 600, fill: 1 / 600, max: 4 / 600 });
    expect(startFraming(range)).toEqual({ scale: 1 / 600, x: 0, y: 0 });
    expect(zoomTo({ width: 900, height: 600 }, range, startFraming(range), 0).scale).toBe(1 / 600);
  });
});

describe("panning", () => {
  const range = zoomRange("logo", WIDE);
  const atFill = { scale: range.fill, x: 0, y: 0 };

  it("keeps the frame covered on an axis where the image is larger", () => {
    expect(panBy(WIDE, atFill, 0.2, 0)).toEqual({ scale: range.fill, x: 0.2, y: 0 });
    expect(panBy(WIDE, atFill, 3, 0)).toEqual({ scale: range.fill, x: 0.5, y: 0 });
    expect(panBy(WIDE, atFill, -3, 0)).toEqual({ scale: range.fill, x: -0.5, y: 0 });
  });

  it("keeps the image centred on an axis where it's no larger than the frame", () => {
    expect(panBy(WIDE, atFill, 0, 0.3)).toEqual({ scale: range.fill, x: 0, y: 0 });
    expect(panBy(WIDE, startFraming(range), 0.3, -0.3)).toEqual(startFraming(range));
  });

  it("can move only an image larger than the frame", () => {
    expect(canPan(WIDE, startFraming(range))).toBe(false);
    expect(canPan(WIDE, atFill)).toBe(true);
    const square = zoomRange("avatar", SQUARE);
    expect(canPan(SQUARE, startFraming(square))).toBe(false);
    expect(canPan(SQUARE, { scale: square.fill * 1.1, x: 0, y: 0 })).toBe(true);
  });

  it("zooms about the frame's centre, then clamps", () => {
    const moved = panBy(WIDE, atFill, 0.5, 0);
    expect(zoomTo(WIDE, range, moved, range.fill * 2)).toEqual({
      scale: range.fill * 2,
      x: 1,
      y: 0,
    });
    // Back below Fill the image no longer covers the frame: it centres.
    expect(zoomTo(WIDE, range, moved, range.min)).toEqual(startFraming(range));
  });

  it("holds a zoom to the range", () => {
    expect(zoomTo(WIDE, range, atFill, 1).scale).toBe(range.max);
    expect(zoomTo(WIDE, range, atFill, 0).scale).toBe(range.min);
  });
});

describe("the size slider", () => {
  const range = zoomRange("logo", WIDE);

  it("runs from the smallest scale to the largest", () => {
    expect(scaleAtStep(range, 0)).toBe(range.min);
    expect(scaleAtStep(range, ZOOM_STEPS)).toBe(range.max);
    expect(stepAtScale(range, range.min)).toBe(0);
    expect(stepAtScale(range, range.max)).toBe(ZOOM_STEPS);
  });

  it("lands exactly on Fill at its step, and rises at every step", () => {
    const fillStep = stepAtScale(range, range.fill);
    expect(scaleAtStep(range, fillStep)).toBe(range.fill);
    for (let step = 1; step <= ZOOM_STEPS; step += 1) {
      expect(scaleAtStep(range, step)).toBeGreaterThan(scaleAtStep(range, step - 1));
    }
  });

  it("has one step when there's nothing to zoom", () => {
    const fixed = zoomRange("avatar", TINY);
    expect(stepAtScale(fixed, fixed.fill)).toBe(0);
    expect(scaleAtStep(fixed, 40)).toBe(fixed.fill);
  });

  it("says Fit, Fill or a share of Fill", () => {
    expect(zoomLabel("logo", range, range.min)).toBe("Fit");
    expect(zoomLabel("logo", range, range.fill)).toBe("Fill");
    expect(zoomLabel("logo", range, range.fill * 1.5)).toBe("150%");
    expect(zoomLabel("logo", range, range.min * 1.01)).toBe("35%");
    const avatar = zoomRange("avatar", SQUARE);
    expect(zoomLabel("avatar", avatar, avatar.min)).toBe("Fill");
  });

  it("stops a stepless zoom at Fill once, on the way past it either way", () => {
    expect(stopAtFill(range, range.min, range.fill * 1.5)).toBe(range.fill);
    expect(stopAtFill(range, range.fill * 2, range.min)).toBe(range.fill);
    expect(stopAtFill(range, range.fill, range.fill * 1.01)).toBe(range.fill * 1.01);
    expect(stopAtFill(range, range.fill * 1.1, range.fill * 1.5)).toBe(range.fill * 1.5);
  });
});

describe("framedDraw", () => {
  it("draws a logo at Fit whole and centred, padded with empty canvas, at 512 px", () => {
    const range = zoomRange("logo", WIDE);
    expectDraw(framedDraw(WIDE, startFraming(range)), {
      side: 512,
      sx: 0,
      sy: 0,
      sw: 800,
      sh: 400,
      dx: 76.8,
      dy: 166.4,
      dw: 358.4,
      dh: 179.2,
    });
  });

  it("draws the part the frame covers, where it was moved to, at its own pixels", () => {
    const range = zoomRange("logo", WIDE);
    // Moved right as far as it goes: the frame shows the logo's left end.
    const moved = panBy(WIDE, { scale: range.fill, x: 0, y: 0 }, 1, 0);
    expectDraw(framedDraw(WIDE, moved), {
      side: 400,
      sx: 0,
      sy: 0,
      sw: 400,
      sh: 400,
      dx: 0,
      dy: 0,
      dw: 400,
      dh: 400,
    });
    const tall = zoomRange("logo", TALL);
    const up = panBy(TALL, { scale: tall.fill, x: 0, y: 0 }, 0, -1);
    expectDraw(framedDraw(TALL, up), {
      side: 300,
      sx: 0,
      sy: 600,
      sw: 300,
      sh: 300,
      dx: 0,
      dy: 0,
      dw: 300,
      dh: 300,
    });
  });

  it("crops an avatar at Fill to its centred square, scaled down to 512 px", () => {
    const size = { width: 900, height: 600 };
    expectDraw(framedDraw(size, startFraming(zoomRange("avatar", size))), {
      side: 512,
      sx: 150,
      sy: 0,
      sw: 600,
      sh: 600,
      dx: 0,
      dy: 0,
      dw: 512,
      dh: 512,
    });
  });

  it("never scales a small source up, nor makes one under 16 px", () => {
    const tiny = zoomRange("logo", TINY);
    expect(framedDraw(TINY, startFraming(tiny)).side).toBe(29);
    expect(framedDraw(TINY, { scale: tiny.max, x: 0, y: 0 }).side).toBe(20);
    const least = { width: 16, height: 16 };
    expect(framedDraw(least, startFraming(zoomRange("avatar", least))).side).toBe(16);
  });

  it("always makes a square the server takes, from any framing in range", () => {
    for (const size of [WIDE, TALL, SQUARE, TINY, { width: 4032, height: 3024 }]) {
      for (const kind of ["logo", "avatar"] as const) {
        const range = zoomRange(kind, size);
        for (const step of [0, 37, ZOOM_STEPS]) {
          const framing = panBy(size, { scale: scaleAtStep(range, step), x: 0, y: 0 }, 9, -9);
          const { side } = framedDraw(size, framing);
          expect(imageSizeError(kind, side, side), `${kind} ${size.width}x${size.height}`).toBe(
            null,
          );
        }
      }
    }
  });
});

describe("sourceSizeError", () => {
  it("refuses only what scaling down can't fix", () => {
    expect(sourceSizeError("avatar", { width: 15, height: 900 })).toMatch(/too small/);
    expect(sourceSizeError("logo", { width: 1000, height: 100 })).toMatch(/4 times/);
    expect(sourceSizeError("avatar", { width: 1000, height: 100 })).toBeNull();
    expect(sourceSizeError("logo", { width: 4000, height: 1000 })).toBeNull();
  });
});
