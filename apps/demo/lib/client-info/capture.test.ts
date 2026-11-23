import { afterEach, describe, expect, it, vi } from "vitest";
import { captureClientInfo, PLATFORM_WAIT_MS, resetClientInfoCapture } from "./capture";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0 Safari/537.36";

/** Just enough of a window for the capture. */
function fakeWindow(overrides: {
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
  userAgentData?: unknown;
}): Window {
  const { userAgentData, ...size } = overrides;
  return {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    ...size,
    navigator: { userAgent: UA, ...(userAgentData ? { userAgentData } : {}) },
  } as unknown as Window;
}

afterEach(() => {
  resetClientInfoCapture();
  vi.useRealTimers();
});

describe("captureClientInfo", () => {
  it("reads the window, the pixel ratio and the platform hint", async () => {
    const hints = vi.fn().mockResolvedValue({ platform: "macOS", platformVersion: "15.1.0" });
    const view = fakeWindow({
      devicePixelRatio: 1.3333333,
      userAgentData: { platform: "macOS", getHighEntropyValues: hints },
    });
    expect(await captureClientInfo(view)).toEqual({
      userAgent: UA,
      viewport: { width: 1440, height: 900 },
      dpr: 1.33,
      platform: { name: "macOS", version: "15.1.0" },
    });
    expect(hints).toHaveBeenCalledWith(["platformVersion"]);
  });

  it("asks for the hint once per page load", async () => {
    const hints = vi.fn().mockResolvedValue({ platform: "Windows", platformVersion: "15.0.0" });
    const view = fakeWindow({
      userAgentData: { platform: "Windows", getHighEntropyValues: hints },
    });
    await captureClientInfo(view);
    await captureClientInfo(view);
    expect(hints).toHaveBeenCalledTimes(1);
  });

  it("goes without the platform in browsers that don't share it", async () => {
    expect(await captureClientInfo(fakeWindow({}))).toEqual({
      userAgent: UA,
      viewport: { width: 1440, height: 900 },
      dpr: 2,
    });
  });

  it("keeps the low-entropy platform when the hint is refused", async () => {
    const hints = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const view = fakeWindow({ userAgentData: { platform: "Linux", getHighEntropyValues: hints } });
    expect((await captureClientInfo(view))?.platform).toEqual({ name: "Linux" });
  });

  it("waits a moment at most for the hint", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const view = fakeWindow({
      userAgentData: { platform: "macOS", getHighEntropyValues: () => never },
    });
    const captured = captureClientInfo(view);
    await vi.advanceTimersByTimeAsync(PLATFORM_WAIT_MS);
    expect(await captured).toEqual({
      userAgent: UA,
      viewport: { width: 1440, height: 900 },
      dpr: 2,
    });
  });

  it("leaves out what's out of range", async () => {
    const view = fakeWindow({ innerWidth: 0, devicePixelRatio: 10 });
    expect(await captureClientInfo(view)).toEqual({ userAgent: UA });
  });

  it("has nothing outside a browser, and never throws", async () => {
    expect(await captureClientInfo(undefined)).toBeUndefined();
    const broken = {
      get innerWidth(): number {
        throw new Error("detached");
      },
    } as unknown as Window;
    expect(await captureClientInfo(broken)).toBeUndefined();
  });
});
