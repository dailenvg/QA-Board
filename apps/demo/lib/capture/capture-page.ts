import type { CDPSession, Page } from "playwright-core";
import { getBrowser } from "./browser";
import { CaptureError } from "./capture-error";
import { REFUSED_HEADER, startGuardProxy, type GuardProxy } from "./guard-proxy";
import { CAPTURE_LIMITS } from "./types";

const VIEWPORT_HEIGHT = 900;
const JPEG_QUALITY = 80;
/** Lower quality used once the image has to shrink anyway. */
const SCALED_QUALITY = 70;
/** Smallest render scale; a 2560 x 16000 page of pure noise fits at 0.5. */
const MIN_SCALE = 0.25;
const LOAD_WAIT_MS = 10_000;
const IDLE_WAIT_MS = 2_500;
/** Upper bound for any single page step; the caller's signal ends the whole capture sooner. */
const STEP_TIMEOUT_MS = 25_000;

export interface CapturedImage {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  /** Page size in CSS px. */
  width: number;
  height: number;
  /** Image px per page px: 1 unless the page was rendered smaller to fit `CAPTURE_LIMITS.maxBytes`. */
  scale: number;
}

/**
 * Scrolls down a viewport at a time so lazy images and on-scroll content load,
 * then returns to the top and waits for web fonts. A string, so bundlers can't
 * rewrite it into something the page can't run.
 */
const SETTLE_SCRIPT = `(async () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const limit = Math.min(document.documentElement.scrollHeight, ${CAPTURE_LIMITS.maxHeight});
  for (let y = 0; y < limit; y += ${VIEWPORT_HEIGHT}) {
    window.scrollTo(0, y);
    await pause(120);
  }
  window.scrollTo(0, 0);
  if (document.fonts) await document.fonts.ready;
})()`;

const HEIGHT_SCRIPT = `Math.max(
  document.documentElement.scrollHeight,
  document.body ? document.body.scrollHeight : 0
)`;

async function load(page: Page, url: URL, proxy: GuardProxy): Promise<void> {
  let refused: boolean;
  try {
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    refused = response?.headers()[REFUSED_HEADER] === "1";
  } catch {
    // An https redirect into a private network fails the navigation at the proxy.
    throw new CaptureError(proxy.refused() ? "private-host" : "unreachable");
  }
  // An http one ends on the proxy's refusal page.
  if (refused) throw new CaptureError("private-host");
  // Slow trackers shouldn't sink the snapshot: capture whatever has loaded by then.
  await page.waitForLoadState("load", { timeout: LOAD_WAIT_MS }).catch(() => undefined);
  await page.evaluate(SETTLE_SCRIPT).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: IDLE_WAIT_MS }).catch(() => undefined);
}

/** Freezes animations, transitions and the caret, so the picture is the page at rest. */
const FREEZE_CSS = `*, *::before, *::after {
  animation-play-state: paused !important;
  animation-delay: -1ms !important;
  animation-duration: 1ms !important;
  transition: none !important;
  caret-color: transparent !important;
}`;

/**
 * Renders the page at `scale` as a JPEG through Chromium's own screenshot
 * call, which can render beyond the viewport at a fractional scale.
 */
async function render(
  cdp: CDPSession,
  width: number,
  height: number,
  scale: number,
  quality: number,
) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale },
  });
  return Buffer.from(data, "base64");
}

/**
 * The page as a JPEG of at most `CAPTURE_LIMITS.maxBytes`, so the response
 * fits a Vercel Function (4.5 MB) without relying on streaming. Full size at
 * quality 80 first; if that's too big, the render scale shrinks by the
 * measured overshoot (byte count grows with pixel count) until it fits.
 */
async function shoot(page: Page, width: number): Promise<CapturedImage> {
  const pageHeight = Number(await page.evaluate(HEIGHT_SCRIPT));
  const height = Math.max(1, Math.min(CAPTURE_LIMITS.maxHeight, Math.round(pageHeight) || 1));
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
  const cdp = await page.context().newCDPSession(page);
  let scale = 1;
  let shot = await render(cdp, width, height, scale, JPEG_QUALITY);
  while (shot.length > CAPTURE_LIMITS.maxBytes && scale > MIN_SCALE) {
    const shrink = Math.sqrt(CAPTURE_LIMITS.maxBytes / shot.length) * 0.9;
    scale = Math.max(MIN_SCALE, Math.floor(scale * shrink * 100) / 100);
    shot = await render(cdp, width, height, scale, SCALED_QUALITY);
  }
  if (shot.length > CAPTURE_LIMITS.maxBytes) throw new CaptureError("failed");
  return { body: new Uint8Array(shot), contentType: "image/jpeg", width, height, scale };
}

/**
 * Captures a full-page JPEG at `width` CSS px (device scale factor 1) in a
 * headless Chromium whose every connection goes through an address-checking
 * proxy. Aborting `signal` closes the page and ends the capture.
 */
export async function capturePage(
  url: URL,
  width: number,
  signal: AbortSignal,
): Promise<CapturedImage> {
  const [browser, proxy] = await Promise.all([getBrowser(), startGuardProxy()]);
  const context = await browser
    .newContext({
      viewport: { width, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      reducedMotion: "reduce",
      acceptDownloads: false,
      // `<-loopback>` drops Chromium's built-in exception, so even localhost goes through the proxy.
      proxy: { server: proxy.server, bypass: "<-loopback>" },
    })
    .catch((error: unknown) => {
      proxy.close();
      throw error;
    });
  const close = () => {
    void context.close().catch(() => undefined);
    proxy.close();
  };
  signal.addEventListener("abort", close);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    await load(page, url, proxy);
    return await shoot(page, width);
  } catch (error) {
    if (signal.aborted) throw new CaptureError("timeout");
    throw error instanceof CaptureError ? error : new CaptureError("failed");
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}
