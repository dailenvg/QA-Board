import { roundRatio, USER_AGENT_MAX, type ClientInfo, type SentClientInfo } from "./schema";

/** How long a post waits for the platform hint before going without it. */
export const PLATFORM_WAIT_MS = 250;

/** Chromium's User-Agent Client Hints (`navigator.userAgentData`); missing elsewhere. */
interface UserAgentData {
  platform?: string;
  getHighEntropyValues?(hints: string[]): Promise<{ platform?: string; platformVersion?: string }>;
}

type Platform = NonNullable<SentClientInfo["platform"]>;

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

function viewportOf(view: Window): SentClientInfo["viewport"] {
  const width = Math.round(view.innerWidth);
  const height = Math.round(view.innerHeight);
  return inRange(width, 1, 10_000) && inRange(height, 1, 10_000) ? { width, height } : undefined;
}

function dprOf(view: Window): number | undefined {
  const dpr = roundRatio(view.devicePixelRatio);
  return inRange(dpr, 0.5, 8) ? dpr : undefined;
}

const cut = (text: string) => text.trim().slice(0, 40);

async function readPlatform(data: UserAgentData | undefined): Promise<Platform | undefined> {
  if (!data) return undefined;
  const low = typeof data.platform === "string" ? cut(data.platform) : "";
  // Refused (a permissions policy) or missing: the low-entropy name still stands.
  const high = await Promise.resolve()
    .then(() => data.getHighEntropyValues?.(["platformVersion"]))
    .catch(() => undefined);
  const name = typeof high?.platform === "string" && high.platform ? cut(high.platform) : low;
  if (!name) return undefined;
  const version = typeof high?.platformVersion === "string" ? cut(high.platformVersion) : "";
  return version ? { name, version } : { name };
}

let platform: Promise<Platform | undefined> | null = null;

/** The platform hint, asked once per page load (it can't change); undefined when there's none. */
function platformOnce(view: Window): Promise<Platform | undefined> {
  platform ??= readPlatform(
    (view.navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData,
  ).catch(() => undefined);
  return platform;
}

function within<T>(promise: Promise<T | undefined>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/**
 * The browser posting a comment, read when it's sent: the window size, the
 * pixel ratio and, where the browser shares it, the platform and its version
 * (waited for at most `PLATFORM_WAIT_MS`). Anything it can't read is left
 * out; it never throws. `userAgent` is this browser's own, for the copy shown
 * at once; the server records the one on the request instead.
 */
export async function captureClientInfo(
  view: Window | undefined = globalThis.window,
): Promise<ClientInfo | undefined> {
  if (!view) return undefined;
  try {
    const viewport = viewportOf(view);
    const dpr = dprOf(view);
    const found = await within(platformOnce(view), PLATFORM_WAIT_MS);
    return {
      userAgent: String(view.navigator.userAgent ?? "").slice(0, USER_AGENT_MAX),
      ...(viewport ? { viewport } : {}),
      ...(dpr !== undefined ? { dpr } : {}),
      ...(found ? { platform: found } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Forgets the platform asked for, so a test starts afresh. */
export function resetClientInfoCapture(): void {
  platform = null;
}
