import type { ClientInfo } from "./schema";

/**
 * Browser details in words, read from what was stored (`ClientInfo`) each
 * time they're shown, so a better reading here applies to every comment.
 * In-house on purpose: the usual parser (ua-parser-js 2) is AGPL. Only the
 * browsers and systems people review on are named; anything else is "Unknown".
 */

export interface InfoRow {
  label: string;
  value: string;
}

/** Where the comment was posted: the review link (a client's) or Squint itself (the team's). */
export type PostedFrom = "review-link" | "squint";

const UNKNOWN = "Unknown";

/** Name and version pattern, most specific first: Edge and Opera also say Chrome and Safari. */
const BROWSERS: ReadonlyArray<[name: string, pattern: RegExp]> = [
  ["Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /\b(?:OPR|OPiOS|OPT)\/(\d+)/],
  ["Samsung Internet", /\bSamsungBrowser\/(\d+)/],
  ["Vivaldi", /\bVivaldi\/(\d+\.\d+)/],
  ["Yandex Browser", /\bYaBrowser\/(\d+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/(\d+)/],
  ["Chromium", /\bChromium\/(\d+)/],
  ["Chrome", /\b(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /\bVersion\/(\d+(?:\.\d+)?)(?:\.\d+)*(?: Mobile\/\w+)? Safari\//],
];

/** "Chrome 131", "Safari 18.1"; null when the user agent names none of `BROWSERS`. */
export function browserName(userAgent: string): string | null {
  for (const [name, pattern] of BROWSERS) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) return `${name} ${version}`;
  }
  return null;
}

/** "15.1.0" → "15.1", "15.0.0" → "15": trailing zero parts say nothing. */
const shortVersion = (version: string) => version.replace(/(?:\.0)+$/, "");

const majorOf = (version: string | undefined) => Number.parseInt(version ?? "", 10);

/**
 * Windows from its NT version. Windows 11 still says NT 10.0, so only the
 * client hint tells them apart: a platform version of 13 or more is Windows 11,
 * 1 to 12 is Windows 10 (Microsoft's mapping).
 */
function windows(nt: string, hint: string | undefined): string {
  if (nt !== "10.0") {
    const older: Record<string, string> = { "6.3": "8.1", "6.2": "8", "6.1": "7" };
    return older[nt] ? `Windows ${older[nt]}` : "Windows";
  }
  const major = majorOf(hint);
  if (major >= 13) return "Windows 11";
  if (major >= 1) return "Windows 10";
  return "Windows 10 or 11";
}

/** iOS and iPadOS write their version as `OS 17_1`. */
const appleMobile = (name: string, version: string | undefined) =>
  version ? `${name} ${shortVersion(version.replace(/_/g, "."))}` : name;

/**
 * The operating system. Browsers freeze the version in the user agent (every
 * Mac says 10.15.7, Chrome on Android says 10), so a version shows only where
 * it's real: the client hint (Chromium), or iOS and iPadOS, which still send it.
 */
export function systemName(userAgent: string, platform?: ClientInfo["platform"]): string | null {
  const hint = (name: string) => (platform?.name === name ? platform.version : undefined);
  const iPad = /\biPad\b.*?\bOS (\d+(?:_\d+)*)/.exec(userAgent);
  if (iPad) return appleMobile("iPadOS", iPad[1]);
  const iPhone = /\b(?:iPhone|iPod)\b.*?\bOS (\d+(?:_\d+)*)/.exec(userAgent);
  if (iPhone) return appleMobile("iOS", iPhone[1]);
  const android = /\bAndroid (\d+(?:\.\d+)*)(; K\))?/.exec(userAgent);
  if (android) {
    const real = hint("Android") || (android[2] ? undefined : android[1]);
    return real ? `Android ${majorOf(real)}` : "Android";
  }
  const nt = /\bWindows NT (\d+\.\d+)/.exec(userAgent)?.[1];
  if (nt) return windows(nt, hint("Windows"));
  if (/\bCrOS\b/.test(userAgent)) return "ChromeOS";
  if (/\bMac OS X\b|\bMacintosh\b/.test(userAgent)) {
    const version = hint("macOS");
    return version ? `macOS ${shortVersion(version)}` : "macOS";
  }
  if (/\bLinux\b/.test(userAgent)) return "Linux";
  return null;
}

/** "2×", "1.5×". */
const ratio = (dpr: number) => `${dpr}×`;

/**
 * The rows "Get info" shows for a comment's browser, in order; null when
 * nothing was recorded (comments posted before 052).
 */
export function describeClientInfo(
  info: ClientInfo | undefined,
  from: PostedFrom,
): InfoRow[] | null {
  if (!info) return null;
  const { userAgent, viewport, dpr, platform } = info;
  return [
    { label: "Browser", value: browserName(userAgent) ?? UNKNOWN },
    { label: "Operating system", value: systemName(userAgent, platform) ?? UNKNOWN },
    {
      label: "Window size",
      value: viewport ? `${viewport.width} × ${viewport.height}` : UNKNOWN,
    },
    { label: "Pixel ratio", value: dpr !== undefined ? ratio(dpr) : UNKNOWN },
    { label: "Posted from", value: from === "review-link" ? "Review link" : "Squint" },
  ];
}

/**
 * The details as plain text for "Copy details": one "Label: value" line per
 * row, then the raw user agent, which a developer may want to read for themselves.
 */
export function clientInfoText(rows: readonly InfoRow[], info: ClientInfo): string {
  const lines = rows.map((row) => `${row.label}: ${row.value}`);
  return [...lines, `User agent: ${info.userAgent || UNKNOWN}`].join("\n");
}
