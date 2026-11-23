import { describe, expect, it } from "vitest";
import { clampSlice, planSlices, shootSlices, type Slice } from "./slices";

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

describe("cutting a slice to a page that got shorter", () => {
  it("keeps a slice the page still covers", () => {
    expect(clampSlice({ y: 900, height: 900 }, 3_140)).toEqual({ y: 900, height: 900 });
  });

  it("cuts a slice that runs past the page's end", () => {
    expect(clampSlice({ y: 2_700, height: 500 }, 3_140)).toEqual({ y: 2_700, height: 440 });
  });

  it("drops a slice the page no longer reaches", () => {
    expect(clampSlice({ y: 2_700, height: 10 }, 2_690)).toBeNull();
    expect(clampSlice({ y: 2_700, height: 10 }, 2_700)).toBeNull();
  });

  it("leaves a slice as it is when the height can't be read", () => {
    expect(clampSlice({ y: 2_700, height: 500 }, Number.NaN)).toEqual({ y: 2_700, height: 500 });
  });
});

const SLICES: Slice[] = [
  { y: 0, height: 900 },
  { y: 900, height: 900 },
  { y: 1_800, height: 200 },
];

/** A shot of `slice` as planned. */
function shotOf(slice: Slice): Promise<{ slice: Slice }> {
  return Promise.resolve({ slice });
}

/** Where each shot starts, top first. */
function tops(shots: Array<{ slice: Slice }>): number[] {
  return shots.map(({ slice }) => slice.y);
}

describe("shooting slices", () => {
  it("shoots every slice when there's time", async () => {
    const result = await shootSlices(SLICES, shotOf, new AbortController().signal);
    expect(tops(result.shots)).toEqual([0, 900, 1_800]);
    expect(result).toMatchObject({ height: 2_000, partial: false });
  });

  it("counts the height each shot covers, and ends where the page now ends", async () => {
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        if (index === 1) return shotOf({ y: 900, height: 850 });
        return index === 2 ? Promise.resolve(null) : shotOf(slice);
      },
      new AbortController().signal,
    );
    expect(tops(result.shots)).toEqual([0, 900]);
    expect(result).toMatchObject({ height: 1_750, partial: false });
  });

  it("stops at a slice cut short, even when the page grows back after it", async () => {
    let calls = 0;
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        calls += 1;
        return shotOf(index === 1 ? { y: 900, height: 850 } : slice);
      },
      new AbortController().signal,
    );
    expect(calls).toBe(2);
    expect(tops(result.shots)).toEqual([0, 900]);
    expect(result).toMatchObject({ height: 1_750, partial: false });
  });

  it("stops before the next slice once told to, keeping what's shot", async () => {
    const stop = new AbortController();
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        if (index === 1) stop.abort();
        return shotOf(slice);
      },
      stop.signal,
    );
    // The slice under way when the stop came still lands if it's done first.
    expect(tops(result.shots)).toEqual([0, 900]);
    expect(result).toMatchObject({ height: 1_800, partial: true });
  });

  it("abandons a slice still being shot when told to stop", async () => {
    const stop = new AbortController();
    const result = await shootSlices(
      SLICES,
      (slice, index) => {
        if (index === 0) return shotOf(slice);
        stop.abort();
        return new Promise<{ slice: Slice }>(() => {});
      },
      stop.signal,
    );
    expect(tops(result.shots)).toEqual([0]);
    expect(result).toMatchObject({ height: 900, partial: true });
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
        return { slice };
      },
      stop.signal,
    );
    expect(tops(result.shots)).toEqual([0]);
    expect(result).toMatchObject({ height: 900, partial: true });
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
