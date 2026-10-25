import { describe, expect, it } from "vitest";
import { MAX_CROP_EDGE, planCrop, toPagePx } from "./geometry";

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
