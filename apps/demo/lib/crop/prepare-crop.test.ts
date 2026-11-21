import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingCrop } from "../viewer-backend/backend";
import { CROP_ATTEMPTS, CROP_BACKOFF_MS, CROP_RENDER_TIMEOUT_MS, cropBackoff } from "./crop-retry";
import { onSurface, prepareCrop } from "./prepare-crop";

const rect = { x: 0, y: 0, width: 10, height: 10 };
const picture = new Blob(["jpeg"], { type: "image/jpeg" });

/** Takes that answer in turn: a picture, nothing, a throw, a rejected or a never-ending render. */
function takes(...answers: Array<"ok" | "null" | "missing" | "throws" | "rejects" | "hangs">) {
  const take = vi.fn((): PendingCrop | null => {
    const answer = answers.shift() ?? "null";
    if (answer === "missing") return null;
    if (answer === "throws") throw new Error("InvalidStateError");
    const blob =
      answer === "ok"
        ? Promise.resolve(picture)
        : answer === "rejects"
          ? Promise.reject(new Error("SecurityError"))
          : answer === "hangs"
            ? new Promise<Blob | null>(() => {})
            : Promise.resolve(null);
    return { blob, rect };
  });
  return take;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("cropBackoff", () => {
  it("waits before retries only, growing, and never past the last step", () => {
    expect(cropBackoff(0)).toBe(0);
    expect(cropBackoff(1)).toBe(CROP_BACKOFF_MS[0]);
    expect(cropBackoff(2)).toBe(CROP_BACKOFF_MS[1]);
    expect(cropBackoff(9)).toBe(CROP_BACKOFF_MS[1]);
    expect(CROP_BACKOFF_MS[0]).toBeLessThan(CROP_BACKOFF_MS[1]);
  });
});

describe("prepareCrop", () => {
  it("reads the screen in the call itself, before anything re-renders", async () => {
    const take = takes("ok");
    const ready = prepareCrop(take);
    expect(take).toHaveBeenCalledTimes(1);
    await expect(ready).resolves.toEqual({ blob: picture, rect });
  });

  it("retries a failed render after a short backoff, reading the screen again", async () => {
    const take = takes("null", "ok");
    const onRetry = vi.fn();
    const ready = prepareCrop(take, { onRetry });
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(take).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CROP_BACKOFF_MS[0] - 1);
    expect(take).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(ready).resolves.toEqual({ blob: picture, rect });
    expect(take).toHaveBeenCalledTimes(2);
  });

  it("gives up after CROP_ATTEMPTS failures of every kind, without rejecting", async () => {
    const take = takes("missing", "throws", "rejects");
    const ready = prepareCrop(take);
    await vi.runAllTimersAsync();
    await expect(ready).resolves.toBeNull();
    expect(take).toHaveBeenCalledTimes(CROP_ATTEMPTS);
  });

  it("counts a render that never finishes as failed, so the send goes on", async () => {
    const take = takes("hangs", "hangs", "ok");
    const ready = prepareCrop(take);
    await vi.advanceTimersByTimeAsync(CROP_RENDER_TIMEOUT_MS);
    expect(take).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CROP_BACKOFF_MS[0] + CROP_RENDER_TIMEOUT_MS);
    expect(take).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(CROP_BACKOFF_MS[1]);
    await expect(ready).resolves.toEqual({ blob: picture, rect });
  });
});

describe("onSurface", () => {
  it("takes while the comment's surface is on stage, and nothing once it isn't", () => {
    let shown = true;
    const take = takes("ok", "ok");
    const guarded = onSurface(take, () => shown);
    expect(guarded()).not.toBeNull();
    shown = false;
    expect(guarded()).toBeNull();
    expect(take).toHaveBeenCalledTimes(1);
  });

  it("ends without a screenshot, never another surface's, when the page changes before a retry", async () => {
    let stage = "page:p1";
    const take = takes("null", "ok", "ok");
    const ready = prepareCrop(onSurface(take, () => stage === "page:p1"));
    await vi.advanceTimersByTimeAsync(0);
    // The person moves to page 2 during the backoff: the retries would read it.
    stage = "page:p2";
    await vi.runAllTimersAsync();
    await expect(ready).resolves.toBeNull();
    expect(take).toHaveBeenCalledTimes(1);
  });
});
