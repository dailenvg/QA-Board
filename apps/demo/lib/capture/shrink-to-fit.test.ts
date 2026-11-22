import { describe, expect, it } from "vitest";
import { MIN_SCALE, shrinkToFit, shrunkScale } from "./shrink-to-fit";
import { CAPTURE_LIMITS } from "./types";

const log = () => {};

/** A render whose size grows with pixel count: `fullBytes` at scale 1. */
function renderOf(fullBytes: number) {
  const calls: Array<{ scale: number; quality: number }> = [];
  const render = (scale: number, quality: number) => {
    calls.push({ scale, quality });
    return Promise.resolve(Buffer.alloc(Math.round(fullBytes * scale * scale)));
  };
  return { render, calls };
}

describe("the shrink step", () => {
  it("shrinks the side by the square root of the overshoot, with a margin", () => {
    expect(shrunkScale(1, CAPTURE_LIMITS.maxBytes * 4)).toBe(0.45);
    expect(shrunkScale(0.5, CAPTURE_LIMITS.maxBytes * 1.21)).toBe(0.4);
  });

  it("never goes below the smallest scale", () => {
    expect(shrunkScale(1, CAPTURE_LIMITS.maxBytes * 1_000)).toBe(MIN_SCALE);
  });
});

describe("shrinking to fit", () => {
  it("keeps a picture that fits at full size and quality 80", async () => {
    const { render, calls } = renderOf(1_000_000);
    const result = await shrinkToFit(render, "jpeg", log);
    expect(result.scale).toBe(1);
    expect(calls).toEqual([{ scale: 1, quality: 80 }]);
  });

  it("renders a big picture smaller, at quality 70, until it fits", async () => {
    const { render, calls } = renderOf(CAPTURE_LIMITS.maxBytes * 4);
    const result = await shrinkToFit(render, "jpeg", log);
    expect(result.scale).toBe(0.45);
    expect(result.image.length).toBeLessThanOrEqual(CAPTURE_LIMITS.maxBytes);
    expect(calls).toEqual([
      { scale: 1, quality: 80 },
      { scale: 0.45, quality: 70 },
    ]);
  });

  it("fails when even the smallest scale is too big", async () => {
    const { render } = renderOf(CAPTURE_LIMITS.maxBytes * 100);
    await expect(shrinkToFit(render, "jpeg", log)).rejects.toMatchObject({ code: "failed" });
  });
});
