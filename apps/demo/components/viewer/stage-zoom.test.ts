import { describe, expect, it } from "vitest";
import {
  anchorCorrection,
  anchorOn,
  clampZoom,
  effectiveZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  visibleCentre,
  wheelZoom,
  zoomLabel,
  zoomStepDown,
  zoomStepUp,
} from "./stage-zoom";

describe("zoom steps", () => {
  it("moves to the next step either way", () => {
    expect(zoomStepUp(1)).toBe(1.25);
    expect(zoomStepDown(1)).toBe(0.75);
    expect(zoomStepUp(0.25)).toBe(0.33);
    expect(zoomStepDown(0.33)).toBe(0.25);
    expect(zoomStepUp(3)).toBe(4);
  });

  it("steps from a level between steps, as Fit or the wheel leave it", () => {
    expect(zoomStepUp(0.42)).toBe(0.5);
    expect(zoomStepDown(0.42)).toBe(0.33);
    expect(zoomStepUp(1.8)).toBe(2);
    expect(zoomStepDown(1.8)).toBe(1.5);
  });

  it("skips a step too close to the level to show a change", () => {
    expect(zoomStepUp(0.497)).toBe(0.67);
    expect(zoomStepDown(1.004)).toBe(0.75);
  });

  it("stops at the limits", () => {
    expect(zoomStepUp(MAX_ZOOM)).toBeNull();
    expect(zoomStepDown(MIN_ZOOM)).toBeNull();
  });

  it("only zooms in from a Fit below the smallest step (a very wide image)", () => {
    expect(zoomStepDown(0.0625)).toBeNull();
    expect(zoomStepUp(0.0625)).toBe(0.25);
  });
});

describe("clampZoom and effectiveZoom", () => {
  it("keeps levels from 25% to 400%", () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(1.3)).toBe(1.3);
  });

  it("reads Fit as the fit's own level, once it's measured", () => {
    expect(effectiveZoom("fit", 0.6)).toBe(0.6);
    expect(effectiveZoom("fit", null)).toBeNull();
    expect(effectiveZoom(2, 0.6)).toBe(2);
  });

  it("labels Fit and percentages", () => {
    expect(zoomLabel("fit")).toBe("Fit");
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(0.333)).toBe("33%");
  });
});

describe("wheelZoom", () => {
  it("zooms in on a wheel up (or a pinch out) and out on a wheel down", () => {
    expect(wheelZoom(1, -100)).toBeCloseTo(Math.exp(0.2));
    expect(wheelZoom(1, 100)).toBeCloseTo(Math.exp(-0.2));
  });

  it("moves a pinch's small deltas by a little", () => {
    const next = wheelZoom(1, -4) ?? 0;
    expect(next).toBeGreaterThan(1);
    expect(next).toBeLessThan(1.01);
  });

  it("caps one event's move, in px, line or page mode", () => {
    const notch = wheelZoom(1, -100);
    expect(wheelZoom(1, -1000)).toBe(notch);
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(Math.exp(48 * 0.002));
    expect(wheelZoom(1, -1, 2)).toBe(notch);
  });

  it("clamps to the limits, and does nothing at them", () => {
    expect(wheelZoom(3.9, -100)).toBe(MAX_ZOOM);
    expect(wheelZoom(MAX_ZOOM, -100)).toBeNull();
    expect(wheelZoom(MIN_ZOOM, 100)).toBeNull();
    expect(wheelZoom(1, 0)).toBeNull();
  });

  it("never zooms in when asked to zoom out from a Fit below the smallest level", () => {
    expect(wheelZoom(0.1, 100)).toBeNull();
    expect(wheelZoom(0.1, -100)).toBe(MIN_ZOOM);
  });
});

describe("the anchor", () => {
  const before = { left: 100, top: -200, width: 1000, height: 3000 };

  it("finds the spot under the point as fractions of the surface", () => {
    expect(anchorOn({ x: 600, y: 400 }, before)).toEqual({ x: 0.5, y: 0.2 });
  });

  it("keeps a point in the stage's margin on the surface's nearest edge", () => {
    expect(anchorOn({ x: 20, y: 3000 }, before)).toEqual({ x: 0, y: 1 });
  });

  it("scrolls by however far the spot moved from the point", () => {
    const point = { x: 600, y: 400 };
    const anchor = anchorOn(point, before);
    // Twice the size, from the same top left: the spot moved 500 px right and 600 px down.
    const after = { left: 100, top: -200, width: 2000, height: 6000 };
    expect(anchorCorrection(anchor, after, point)).toEqual({ x: 500, y: 600 });
    // Once scrolled by that much, the spot is under the point again.
    const scrolled = { ...after, left: after.left - 500, top: after.top - 600 };
    expect(anchorCorrection(anchor, scrolled, point)).toEqual({ x: 0, y: 0 });
  });

  it("zooms around the centre of the stage's visible part", () => {
    const viewport = { width: 1280, height: 800 };
    expect(visibleCentre({ left: 40, top: 80, width: 900, height: 700 }, viewport)).toEqual({
      x: 490,
      y: 430,
    });
    // A stage running past the bottom of the window: its centre on screen.
    expect(visibleCentre({ left: 0, top: 100, width: 1280, height: 1500 }, viewport)).toEqual({
      x: 640,
      y: 450,
    });
  });
});
