import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capture, CAPTURE_TIMEOUT_MS } from "./capture";
import { CaptureError } from "./capture-error";

vi.mock("../frame-check/probe", () => ({ checkHost: () => Promise.resolve("public") }));
vi.mock("./step-log", () => ({ stepLog: () => () => {} }));
// A step that ignores the abort, like a page call on a stuck browser.
vi.mock("./capture-page", () => ({ capturePage: () => new Promise(() => {}) }));

describe("capture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers with a timeout even when a step never settles", async () => {
    const result = capture(new URL("https://example.com"), 1440).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS);
    const error = await result;
    expect(error).toBeInstanceOf(CaptureError);
    expect((error as CaptureError).code).toBe("timeout");
  });

  it("frees its slot after a timeout", async () => {
    const first = capture(new URL("https://example.com"), 1440).catch(() => null);
    const second = capture(new URL("https://example.com"), 1440).catch(() => null);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS);
    await Promise.all([first, second]);
    const third = capture(new URL("https://example.com"), 1440).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS);
    expect((await third) as CaptureError).toMatchObject({ code: "timeout" });
  });
});
