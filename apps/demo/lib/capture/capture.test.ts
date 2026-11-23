import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_LIMIT_MS } from "./browser";
import { capture, CAPTURE_TIMEOUT_MS, SETTLE_MS, STOP_SLICING_MS } from "./capture";
import { CaptureError } from "./capture-error";
import type { CapturedImage } from "./capture-page";

const page = vi.hoisted(() => ({
  capture: (
    _url: URL,
    _width: number,
    _signal: AbortSignal,
    _stop: AbortSignal,
  ): Promise<CapturedImage> => new Promise(() => {}),
}));

vi.mock("../frame-check/probe", () => ({ checkHost: () => Promise.resolve("public") }));
vi.mock("./step-log", () => ({ stepLog: () => () => {} }));
vi.mock("./capture-page", () => ({
  capturePage: (url: URL, width: number, signal: AbortSignal, stop: AbortSignal) =>
    page.capture(url, width, signal, stop),
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

  it("tells the page to stop slicing with time left to close and stitch before the abort", async () => {
    let stopped = -1;
    let aborted = -1;
    page.capture = (_url, _width, signal, stop) =>
      new Promise(() => {
        stop.addEventListener("abort", () => (stopped = Date.now()));
        signal.addEventListener("abort", () => (aborted = Date.now()));
      });
    const start = Date.now();
    void capture(new URL("https://example.com"), 1440).catch(() => null);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS + SETTLE_MS);
    expect(stopped - start).toBe(STOP_SLICING_MS);
    expect(aborted - start).toBe(CAPTURE_TIMEOUT_MS);
    expect(CAPTURE_TIMEOUT_MS - STOP_SLICING_MS).toBeGreaterThan(CLOSE_LIMIT_MS + 5_000);
    // The latest a timeout answers, well inside the routes' 60 s limit with a cold start.
    expect(CAPTURE_TIMEOUT_MS + SETTLE_MS).toBeLessThanOrEqual(50_000);
  });

  it("answers a partial capture as a capture", async () => {
    const image: CapturedImage = {
      body: new Uint8Array(1),
      contentType: "image/jpeg",
      width: 1440,
      height: 900,
      scale: 1,
      partial: true,
    };
    page.capture = (_url, _width, _signal, stop) =>
      new Promise((resolve) => stop.addEventListener("abort", () => resolve(image)));
    const result = capture(new URL("https://example.com"), 1440);
    await vi.advanceTimersByTimeAsync(STOP_SLICING_MS);
    expect(await result).toBe(image);
  });
});
