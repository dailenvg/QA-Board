import { describe, expect, it } from "vitest";
import { atLeastCropWindow, MAX_CROP_EDGE, MIN_CROP_WINDOW, planCrop, toPagePx } from "./geometry";

/** A 1000 × 4000 px snapshot drawn at half size, scrolled so its top 400px are above the view. */
const base = {
  image: { left: 100, top: -200, width: 500, height: 2000 },
  view: { left: 100, top: 0, width: 500, height: 400 },
  natural: { width: 1000, height: 4000 },
};

describe("planCrop", () => {
  it("cuts out the visible region, in surface px", () => {
    const plan = planCrop({ ...base, pin: { x: 50, y: 15 } });
    expect(plan?.rect).toEqual({ x: 0, y: 400, width: 1000, height: 800 });
    expect(plan?.pin).toEqual({ x: 500, y: 600 });
    expect(plan?.scale).toBe(1);
    // A 32px marker on screen is 64 surface px at half size.
    expect(plan?.markerSize).toBe(64);
  });

  it("centres on the pin when it has scrolled out of view", () => {
    const plan = planCrop({ ...base, pin: { x: 50, y: 90 } });
    expect(plan?.rect).toEqual({ x: 0, y: 3200, width: 1000, height: 800 });
  });

  it("keeps a centred region inside the surface", () => {
    const plan = planCrop({ ...base, pin: { x: 50, y: 99 } });
    expect(plan?.rect.y).toBe(3200);
    expect(plan?.rect.height).toBe(800);
  });

  it("scales big regions down to the maximum edge", () => {
    const plan = planCrop({
      image: { left: 0, top: 0, width: 1000, height: 1000 },
      view: { left: 0, top: 0, width: 1000, height: 1000 },
      natural: { width: 3200, height: 3200 },
      pin: { x: 10, y: 10 },
    });
    expect(plan?.scale).toBe(MAX_CROP_EDGE / 3200);
  });

  it("gives up on a surface that isn't laid out", () => {
    expect(
      planCrop({ ...base, image: { ...base.image, width: 0 }, pin: { x: 1, y: 1 } }),
    ).toBeNull();
  });
});

describe("a crop on a zoomed-in stage", () => {
  /** A 1440 × 6000 px snapshot at 400%, the stage showing 600 × 400 css px of it. */
  const zoomed = {
    image: { left: -2000, top: -8000, width: 5760, height: 24000 },
    view: { left: 0, top: 0, width: 600, height: 400 },
    natural: { width: 1440, height: 6000 },
  };

  it("never cuts less than the minimum window around the pin", () => {
    // On screen: x 500 to 650, y 2000 to 2100 in surface px; the pin at (575, 2050).
    const plan = planCrop({ ...zoomed, pin: { x: (575 / 1440) * 100, y: (2050 / 6000) * 100 } });
    expect(plan?.rect).toEqual({ x: 335, y: 1890, width: 480, height: 320 });
    expect(plan?.pin.x).toBeCloseTo(575);
    expect(plan?.scale).toBe(1);
  });

  it("grows a pin that scrolled out of view to the minimum window too", () => {
    const plan = planCrop({ ...zoomed, pin: { x: 50, y: 90 } });
    expect(plan?.rect).toEqual({ x: 480, y: 5240, width: 480, height: 320 });
  });

  it("draws the marker at least as big as at 100%", () => {
    const plan = planCrop({ ...zoomed, pin: { x: 40, y: 34 } });
    expect(plan?.markerSize).toBe(32);
  });

  it("keeps the 1600 px output cap", () => {
    const plan = planCrop({
      image: { left: 0, top: 0, width: 4000, height: 4000 },
      view: { left: 0, top: 0, width: 4000, height: 4000 },
      natural: { width: 4000, height: 4000 },
      pin: { x: 50, y: 50 },
    });
    expect(plan?.scale).toBe(MAX_CROP_EDGE / 4000);
  });
});

describe("atLeastCropWindow", () => {
  const natural = { width: 1440, height: 6000 };

  it("leaves a region at least the minimum as it is", () => {
    const region = { x: 10, y: 20, width: 800, height: 600 };
    expect(atLeastCropWindow(region, natural)).toEqual(region);
  });

  it("grows a small region about its centre", () => {
    expect(atLeastCropWindow({ x: 600, y: 1000, width: 100, height: 100 }, natural)).toEqual({
      x: 410,
      y: 890,
      width: MIN_CROP_WINDOW.width,
      height: MIN_CROP_WINDOW.height,
    });
  });

  it("slides a grown region back inside the surface at its edges", () => {
    expect(atLeastCropWindow({ x: 0, y: 5950, width: 100, height: 50 }, natural)).toEqual({
      x: 0,
      y: 5680,
      width: 480,
      height: 320,
    });
  });

  it("stops at the whole surface on one smaller than the minimum", () => {
    expect(
      atLeastCropWindow({ x: 50, y: 40, width: 100, height: 80 }, { width: 300, height: 200 }),
    ).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});

describe("toPagePx", () => {
  it("maps a crop on a half-size snapshot back to page px", () => {
    expect(toPagePx({ x: 10, y: 400, width: 640, height: 400 }, 0.5)).toEqual({
      x: 20,
      y: 800,
      width: 1280,
      height: 800,
    });
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    expect(toPagePx(rect, 1)).toBe(rect);
  });
});
