import { describe, expect, it } from "vitest";
import { browserName, clientInfoText, describeClientInfo, systemName } from "./describe";

/** Real user agents, as each browser sends them (Chromium's reduced form included). */
const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  chromeLinux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  edgeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/131.2903.68 Mobile/15E148 Safari/605.1.15",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  vivaldi:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.18",
  yandex:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36",
  firefoxMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  firefoxLinux: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  safariMacPatch:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6.1 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  windows7Chrome:
    "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  curl: "curl/8.7.1",
} as const;

describe("browserName", () => {
  it.each([
    [UA.chromeMac, "Chrome 131"],
    [UA.chromeWindows, "Chrome 131"],
    [UA.chromeAndroid, "Chrome 131"],
    [UA.chromeIos, "Chrome 131"],
    [UA.chromeOs, "Chrome 131"],
    [UA.edgeWindows, "Edge 131"],
    [UA.edgeIos, "Edge 131"],
    [UA.operaMac, "Opera 115"],
    [UA.samsung, "Samsung Internet 26"],
    [UA.vivaldi, "Vivaldi 7.0"],
    [UA.yandex, "Yandex Browser 24"],
    [UA.firefoxMac, "Firefox 132"],
    [UA.firefoxAndroid, "Firefox 132"],
    [UA.firefoxIos, "Firefox 132"],
    [UA.safariMac, "Safari 18.1"],
    [UA.safariMacPatch, "Safari 17.6"],
    [UA.safariIphone, "Safari 18.1"],
    [UA.safariIpad, "Safari 17.1"],
  ])("names %s as %s", (userAgent, name) => {
    expect(browserName(userAgent)).toBe(name);
  });

  it("names none it doesn't know", () => {
    expect(browserName(UA.curl)).toBeNull();
    expect(browserName("")).toBeNull();
  });
});

describe("systemName", () => {
  it("says macOS without a version unless the browser shares one (every Mac says 10.15)", () => {
    expect(systemName(UA.safariMac)).toBe("macOS");
    expect(systemName(UA.firefoxMac)).toBe("macOS");
    expect(systemName(UA.chromeMac, { name: "macOS", version: "15.1.0" })).toBe("macOS 15.1");
    expect(systemName(UA.chromeMac, { name: "macOS", version: "15.0.0" })).toBe("macOS 15");
    expect(systemName(UA.chromeMac, { name: "macOS", version: "" })).toBe("macOS");
  });

  it("tells Windows 11 from 10 only by the hint", () => {
    expect(systemName(UA.chromeWindows)).toBe("Windows 10 or 11");
    expect(systemName(UA.firefoxWindows)).toBe("Windows 10 or 11");
    expect(systemName(UA.edgeWindows, { name: "Windows", version: "15.0.0" })).toBe("Windows 11");
    expect(systemName(UA.edgeWindows, { name: "Windows", version: "13.0.0" })).toBe("Windows 11");
    expect(systemName(UA.chromeWindows, { name: "Windows", version: "10.0.0" })).toBe("Windows 10");
    expect(systemName(UA.chromeWindows, { name: "Windows", version: "0.3.0" })).toBe(
      "Windows 10 or 11",
    );
    expect(systemName(UA.windows7Chrome)).toBe("Windows 7");
  });

  it("ignores a hint for another platform", () => {
    expect(systemName(UA.chromeWindows, { name: "macOS", version: "15.1.0" })).toBe(
      "Windows 10 or 11",
    );
  });

  it("reads iOS and iPadOS versions from the user agent", () => {
    expect(systemName(UA.safariIphone)).toBe("iOS 18.1.1");
    expect(systemName(UA.chromeIos)).toBe("iOS 17.1");
    expect(systemName(UA.firefoxIos)).toBe("iOS 17.7");
    expect(systemName(UA.edgeIos)).toBe("iOS 18.1");
    expect(systemName(UA.safariIpad)).toBe("iPadOS 17.1");
  });

  it("reads Android's version, but not Chrome's frozen 10", () => {
    expect(systemName(UA.samsung)).toBe("Android 14");
    expect(systemName(UA.firefoxAndroid)).toBe("Android 14");
    expect(systemName(UA.chromeAndroid)).toBe("Android");
    expect(systemName(UA.chromeAndroid, { name: "Android", version: "15.0.0" })).toBe("Android 15");
  });

  it("names ChromeOS and Linux without versions", () => {
    expect(systemName(UA.chromeOs, { name: "Chrome OS", version: "14541.0.0" })).toBe("ChromeOS");
    expect(systemName(UA.chromeLinux, { name: "Linux", version: "6.5.0" })).toBe("Linux");
    expect(systemName(UA.firefoxLinux)).toBe("Linux");
  });

  it("names none it doesn't know", () => {
    expect(systemName(UA.curl)).toBeNull();
  });
});

describe("describeClientInfo", () => {
  const info = {
    userAgent: UA.chromeMac,
    viewport: { width: 1440, height: 900 },
    dpr: 2,
    platform: { name: "macOS", version: "15.1.0" },
  };

  it("lists the five rows in order", () => {
    expect(describeClientInfo(info, "squint")).toEqual([
      { label: "Browser", value: "Chrome 131" },
      { label: "Operating system", value: "macOS 15.1" },
      { label: "Window size", value: "1440 × 900" },
      { label: "Pixel ratio", value: "2×" },
      { label: "Posted from", value: "Squint" },
    ]);
  });

  it("says Unknown for what wasn't recorded or read", () => {
    expect(describeClientInfo({ userAgent: "" }, "review-link")).toEqual([
      { label: "Browser", value: "Unknown" },
      { label: "Operating system", value: "Unknown" },
      { label: "Window size", value: "Unknown" },
      { label: "Pixel ratio", value: "Unknown" },
      { label: "Posted from", value: "Review link" },
    ]);
    expect(describeClientInfo({ ...info, dpr: 1.25 }, "squint")?.[3]?.value).toBe("1.25×");
  });

  it("has nothing for a comment without details", () => {
    expect(describeClientInfo(undefined, "squint")).toBeNull();
  });

  it("copies the rows and the raw user agent as text", () => {
    const rows = describeClientInfo(info, "squint") ?? [];
    expect(clientInfoText(rows, info)).toBe(
      [
        "Browser: Chrome 131",
        "Operating system: macOS 15.1",
        "Window size: 1440 × 900",
        "Pixel ratio: 2×",
        "Posted from: Squint",
        `User agent: ${UA.chromeMac}`,
      ].join("\n"),
    );
  });
});
