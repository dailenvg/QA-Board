import { describe, expect, it } from "vitest";
import {
  CROP_BUDGET_BYTES,
  CROP_QUALITIES,
  encodeWithinBudget,
  FIRST_CROP_STEP,
  MIN_CROP_EDGE,
  nextCropStep,
  type CropStep,
} from "./crop-budget";
import { MB, SHARE_LIMITS } from "../share/limits";

const LOWEST = CROP_QUALITIES[CROP_QUALITIES.length - 1] ?? 0;

/** A fake JPEG encoder: bytes grow with area and quality, and every step is recorded. */
function fakeEncoder(bytesAtFull: number) {
  const steps: CropStep[] = [];
  const encode = (step: CropStep) => {
    steps.push(step);
    const size = Math.round(bytesAtFull * step.scale ** 2 * step.quality);
    return Promise.resolve(new Blob([new Uint8Array(size)], { type: "image/jpeg" }));
  };
  return { encode, steps };
}

describe("CROP_BUDGET_BYTES", () => {
  it("stays under the share server's crop limit", () => {
    expect(CROP_BUDGET_BYTES).toBeLessThan(SHARE_LIMITS.blobBytes.crop);
    expect(CROP_BUDGET_BYTES).toBeGreaterThan(1.7 * MB);
  });
});

describe("nextCropStep", () => {
  it("lowers the quality first, at the same size", () => {
    expect(nextCropStep(FIRST_CROP_STEP, 3 * MB, 1600)).toEqual({
      scale: 1,
      quality: CROP_QUALITIES[1],
    });
  });

  it("then draws smaller, sized from how far over the budget it was", () => {
    const next = nextCropStep({ scale: 1, quality: LOWEST }, 4 * CROP_BUDGET_BYTES, 1600);
    // Four times the bytes: half the sides, with a margin.
    expect(next?.quality).toBe(LOWEST);
    expect(next?.scale).toBeCloseTo(0.45);
  });

  it("always shrinks by a real step, even when barely over", () => {
    const next = nextCropStep({ scale: 1, quality: LOWEST }, CROP_BUDGET_BYTES + 1, 1600);
    expect(next?.scale).toBe(0.85);
  });

  it("never draws the longest edge under the minimum", () => {
    const next = nextCropStep({ scale: 1, quality: LOWEST }, 100 * MB, 1600);
    expect(next?.scale).toBe(MIN_CROP_EDGE / 1600);
  });

  it("gives up once it's at the smallest size and quality", () => {
    expect(nextCropStep({ scale: MIN_CROP_EDGE / 1600, quality: LOWEST }, 3 * MB, 1600)).toBe(null);
    // A crop planned under the minimum is never drawn smaller.
    expect(nextCropStep({ scale: 1, quality: LOWEST }, 3 * MB, 300)).toBe(null);
  });
});

describe("encodeWithinBudget", () => {
  it("keeps the first encoding when it fits", async () => {
    const { encode, steps } = fakeEncoder(1 * MB);
    const blob = await encodeWithinBudget(encode, 1600);
    expect(steps).toEqual([FIRST_CROP_STEP]);
    expect(blob?.type).toBe("image/jpeg");
  });

  it("steps quality down until it fits", async () => {
    const { encode, steps } = fakeEncoder(2.6 * MB);
    const blob = await encodeWithinBudget(encode, 1600);
    expect(steps.map((step) => step.quality)).toEqual([0.85, 0.72, 0.6]);
    expect(steps.every((step) => step.scale === 1)).toBe(true);
    expect(blob?.size).toBeLessThanOrEqual(CROP_BUDGET_BYTES);
  });

  it("scales down when even the lowest quality is too big", async () => {
    const { encode, steps } = fakeEncoder(12 * MB);
    const blob = await encodeWithinBudget(encode, 1600);
    expect(steps.length).toBeGreaterThan(CROP_QUALITIES.length);
    expect(steps.at(-1)?.scale).toBeLessThan(1);
    expect(blob?.size).toBeLessThanOrEqual(CROP_BUDGET_BYTES);
  });

  it("returns null when nothing fits or the encoder fails", async () => {
    const { encode } = fakeEncoder(1000 * MB);
    expect(await encodeWithinBudget(encode, 1600)).toBe(null);
    expect(await encodeWithinBudget(() => Promise.resolve(null), 1600)).toBe(null);
  });
});
