import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capture, CAPTURE_TIMEOUT_MS, SETTLE_MS } from "./capture";
import { CaptureError } from "./capture-error";
import type { CapturedImage } from "./capture-page";

const page = vi.hoisted(() => ({
  capture: (_url: URL, _width: number, _signal: AbortSignal): Promise<CapturedImage> =>
    new Promise(() => {}),
}));

vi.mock("../frame-check/probe", () => ({ checkHost: () => Promise.resolve("public") }));
vi.mock("./step-log", () => ({ stepLog: () => () => {} }));
vi.mock("./capture-page", () => ({
  capturePage: (url: URL, width: number, signal: AbortSignal) => page.capture(url, width, signal),
}));

/** Resolves with the error `promise` rejects with, or "pending" if it hasn't settled yet. */
async function outcome(promise: Promise<unknown>): Promise<unknown> {
  return Promise.race([
    promise.then(
      () => "resolved",
      (error: unknown) => error,
    ),
    Promise.resolve().then(() => "pending"),
  ]);
}

describe("capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    page.capture = () => new Promise(() => {});
  });

  it("answers with a timeout even when a step never settles", async () => {
    const result = capture(new URL("https://example.com"), 1440).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS + SETTLE_MS);
    const error = await result;
    expect(error).toBeInstanceOf(CaptureError);
    expect((error as CaptureError).code).toBe("timeout");
  });

  it("waits for the work to close its browser before answering a timeout", async () => {
    let closed = () => {};
    page.capture = (_url, _width, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => {
          closed = () => reject(new CaptureError("timeout"));
        });
      });
    const result = capture(new URL("https://example.com"), 1440);
    result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS + 1_000);
    expect(await outcome(result)).toBe("pending");
    closed();
    await vi.advanceTimersByTimeAsync(0);
    expect(await outcome(result)).toMatchObject({ code: "timeout" });
  });

  it("frees its slot after a timeout", async () => {
    const first = capture(new URL("https://example.com"), 1440).catch(() => null);
    const second = capture(new URL("https://example.com"), 1440).catch(() => null);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS + SETTLE_MS);
    await Promise.all([first, second]);
    const third = capture(new URL("https://example.com"), 1440).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS + SETTLE_MS);
    expect((await third) as CaptureError).toMatchObject({ code: "timeout" });
  });
});
