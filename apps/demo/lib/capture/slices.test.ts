import { describe, expect, it } from "vitest";
import { planSlices, shootSlices, type Slice } from "./slices";

describe("planning a page's slices", () => {
  it("cuts it a viewport at a time, the last slice only as tall as what's left", () => {
    expect(planSlices(2_000, 900)).toEqual({
      height: 2_000,
      slices: [
        { y: 0, height: 900 },
        { y: 900, height: 900 },
        { y: 1_800, height: 200 },
      ],
    });
  });

  it("is one slice for a page that fits the viewport", () => {
    expect(planSlices(900, 900).slices).toEqual([{ y: 0, height: 900 }]);
    expect(planSlices(640.4, 900)).toEqual({ height: 640, slices: [{ y: 0, height: 640 }] });
  });

  it("stops at the height cap", () => {
    const plan = planSlices(50_000, 900);
    expect(plan.height).toBe(16_000);
    expect(plan.slices).toHaveLength(18);
    expect(plan.slices.at(-1)).toEqual({ y: 15_300, height: 700 });
  });

  it("is one px for a page with no measurable height", () => {
    expect(planSlices(Number.NaN, 900)).toEqual({ height: 1, slices: [{ y: 0, height: 1 }] });
    expect(planSlices(0, 900).height).toBe(1);
  });
});

const SLICES: Slice[] = [
  { y: 0, height: 900 },
  { y: 900, height: 900 },
  { y: 1_800, height: 200 },
];

describe("shooting slices", () => {
  it("shoots every slice when there's time", async () => {
    const result = await shootSlices(
      SLICES,
      (slice) => Promise.resolve(slice.y),
      new AbortController().signal,
    );
    expect(result).toEqual({ shots: [0, 900, 1_800], height: 2_000, partial: false });
  });

  it("stops before the next slice once told to, keeping what's shot", async () => {
    const stop = new AbortController();
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        if (index === 1) stop.abort();
        return Promise.resolve(slice.y);
      },
      stop.signal,
    );
    // The slice under way when the stop came still lands if it's done first.
    expect(result).toEqual({ shots: [0, 900], height: 1_800, partial: true });
  });

  it("abandons a slice still being shot when told to stop", async () => {
    const stop = new AbortController();
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        if (index === 0) return Promise.resolve(slice.y);
        stop.abort();
        return new Promise<number>(() => {});
      },
      stop.signal,
    );
    expect(result).toEqual({ shots: [0], height: 900, partial: true });
  });

  it("waits for the first slice even when already told to stop", async () => {
    const stop = new AbortController();
    stop.abort();
    let calls = 0;
    const result = await shootSlices(
      SLICES,
      async (slice) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return slice.y;
      },
      stop.signal,
    );
    expect(result).toEqual({ shots: [0], height: 900, partial: true });
    expect(calls).toBe(1);
  });

  it("fails when the first slice fails: there's nothing to return", async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(
      shootSlices(SLICES, () => Promise.reject(new Error("browser closed")), stop.signal),
    ).rejects.toThrow("browser closed");
  });
});
