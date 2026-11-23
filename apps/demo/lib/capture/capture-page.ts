import { freemem } from "node:os";
import type { Browser, CDPSession, Page } from "playwright-core";
import { browserTurn, CLOSE_LIMIT_MS, launchBrowser } from "./browser";
import { CaptureError } from "./capture-error";
import { REFUSED_HEADER, startGuardProxy, type GuardProxy } from "./guard-proxy";
import { isLoginPage, LOGIN_SIGNALS_SCRIPT } from "./login-page";
import { safeError } from "./safe-error";
import { shrinkToFit } from "./shrink-to-fit";
import { clampSlice, planSlices, shootSlices, type Slice, type SliceShots } from "./slices";
import { sizedSlices, slicesRenderer, type SliceImage } from "./stitch";
import type { StepLog } from "./step-log";
import { tmpFreeMb } from "./tmp-space";
import { CAPTURE_LIMITS } from "./types";
import { UNPIN_SCRIPT } from "./unpin";
import { whenAborted } from "./when-aborted";

const VIEWPORT_HEIGHT = 900;
/** Slices are encoded again once stitched, so they're shot at a high quality to keep that loss small. */
const SLICE_QUALITY = 90;
/** After scrolling to a slice: time for on-scroll content to show before it's shot. */
const SLICE_PAUSE_MS = 100;
const LOAD_WAIT_MS = 10_000;
const IDLE_WAIT_MS = 2_500;
/** Web fonts still loading after this are shot as they are. */
const FONTS_WAIT_MS = 3_000;
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
  /** Time ran out partway down a long page: the image is its top `height` px. */
  partial?: true;
}

/** What a browser hands back: the whole page, or slices to stitch once it has closed. */
type Shot =
  | { kind: "whole"; image: CapturedImage }
  | { kind: "slices"; width: number; slices: SliceShots<SliceImage> };

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
  if (document.fonts) await Promise.race([document.fonts.ready, pause(${FONTS_WAIT_MS})]);
})()`;

const HEIGHT_SCRIPT = `Math.max(
  document.documentElement.scrollHeight,
  document.body ? document.body.scrollHeight : 0
)`;

/** The page's height in CSS px, NaN if it can't be read. */
async function pageHeight(page: Page): Promise<number> {
  return Number(await page.evaluate(HEIGHT_SCRIPT));
}

/** Unpins the page's bars (`UNPIN_SCRIPT`) and returns what it did, for the log. */
function unpin(page: Page): Promise<string> {
  return page.evaluate<unknown>(UNPIN_SCRIPT).then(String, () => "failed");
}

/** Scrolls straight to `y`, then gives the page two frames and a pause to show what's there. */
function scrollScript(y: number): string {
  return `new Promise((resolve) => {
    window.scrollTo({ top: ${y}, left: 0, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, ${SLICE_PAUSE_MS})));
  })`;
}

/** Whether `wait` finished before `stop` aborted; false at once if it already has. */
function waitUnlessStopped(wait: Promise<unknown>, stop: AbortSignal): Promise<boolean> {
  if (stop.aborted) return Promise.resolve(false);
  const finished = wait.then(
    () => true,
    () => false,
  );
  return Promise.race([finished, whenAborted(stop).catch(() => false)]);
}

/**
 * Opens `url` and lets it settle. Once `stop` aborts, what's left is cut
 * short so a slow page still has time to be shot: the waits for the load
 * event and for the network to go quiet end early, and the lazy-content scroll
 * is skipped if it hasn't started (it can't stop halfway: it moves the page).
 */
async function load(
  page: Page,
  url: URL,
  proxy: GuardProxy,
  stop: AbortSignal,
  log: StepLog,
): Promise<void> {
  let refused: boolean;
  try {
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    refused = response?.headers()[REFUSED_HEADER] === "1";
  } catch (error) {
    log(`goto failed: ${safeError(error)} (${url.hostname})`);
    // An https redirect into a private network fails the navigation at the proxy.
    throw new CaptureError(proxy.refused() ? "private-host" : "unreachable");
  }
  // An http one ends on the proxy's refusal page.
  if (refused) throw new CaptureError("private-host");
  log("goto");
  // Slow trackers shouldn't sink the snapshot: capture whatever has loaded by then.
  const loaded = page.waitForLoadState("load", { timeout: LOAD_WAIT_MS });
  log((await waitUnlessStopped(loaded, stop)) ? "load" : "load cut off");
  if (stop.aborted) {
    log("scroll skipped");
  } else {
    await page.evaluate(SETTLE_SCRIPT).catch(() => undefined);
    log("scroll");
  }
  const idle = page.waitForLoadState("networkidle", { timeout: IDLE_WAIT_MS });
  log((await waitUnlessStopped(idle, stop)) ? "networkidle" : "networkidle cut off");
}

/**
 * Turns away a page that turned out to be a login screen (a protected
 * deployment, a password form) before it's shot: a snapshot of it would have
 * nothing to review. A page whose signals can't be read is shot as usual.
 */
async function refuseLoginPage(page: Page, url: URL, log: StepLog): Promise<void> {
  const signals = await page.evaluate<unknown>(LOGIN_SIGNALS_SCRIPT).catch(() => null);
  if (!signals || !isLoginPage(url, new URL(page.url()), signals)) return;
  log("login page");
  throw new CaptureError("login-page");
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

/** A page no taller than the viewport, in one screenshot that shrinks to fit if it must. */
async function shootWhole(
  cdp: CDPSession,
  width: number,
  height: number,
  log: StepLog,
): Promise<CapturedImage> {
  const { image, scale } = await shrinkToFit(
    (at, quality) => render(cdp, width, height, at, quality),
    "screenshot",
    log,
  );
  return { body: new Uint8Array(image), contentType: "image/jpeg", width, height, scale };
}

/**
 * Scrolls to `planned` and shoots the viewport's part of it. The clip is in
 * page px; on the last slice the browser may stop scrolling short of
 * `planned.y`, which still leaves the slice inside the viewport. From the
 * second slice on, the page's pinned bars are unpinned (`UNPIN_SCRIPT`) once
 * it has scrolled, so bars a scroll handler pins only then are caught too, and
 * the slice is cut to the page's height now: a bar leaving the flow shortens
 * the page. Null when the page now ends above the slice.
 */
async function shootSlice(
  page: Page,
  cdp: CDPSession,
  width: number,
  planned: Slice,
  index: number,
  log: StepLog,
): Promise<SliceImage | null> {
  await page.evaluate(scrollScript(planned.y));
  if (index > 0) log(`unpinned: ${await unpin(page)}`);
  const slice = index > 0 ? clampSlice(planned, await pageHeight(page)) : planned;
  if (!slice) {
    log(`page ends above slice ${index + 1}`);
    return null;
  }
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: SLICE_QUALITY,
    clip: { x: 0, y: slice.y, width, height: slice.height, scale: 1 },
  });
  const jpeg = Buffer.from(data, "base64");
  log(`slice ${index + 1} ${slice.height}px ${jpeg.length}B`);
  return { slice, jpeg };
}

/**
 * Shoots the page: in one screenshot when it fits the viewport, otherwise one
 * viewport at a time until the last slice or until `stop` aborts.
 */
async function shoot(page: Page, width: number, stop: AbortSignal, log: StepLog): Promise<Shot> {
  const plan = planSlices(await pageHeight(page), VIEWPORT_HEIGHT);
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => undefined);
  log(
    `measured ${width}x${plan.height} in ${plan.slices.length} slices, ${tmpFreeMb()} MB free in /tmp, ${memFreeMb()} MB RAM`,
  );
  const cdp = await page.context().newCDPSession(page);
  if (plan.slices.length === 1) {
    return { kind: "whole", image: await shootWhole(cdp, width, plan.height, log) };
  }
  const slices = await shootSlices(
    plan.slices,
    (slice, index) => shootSlice(page, cdp, width, slice, index, log),
    stop,
  );
  if (slices.partial) log(`out of time after ${slices.shots.length}/${plan.slices.length} slices`);
  return { kind: "slices", width, slices };
}

/**
 * Stitches a long page's slices into one JPEG that fits
 * `CAPTURE_LIMITS.maxBytes`. Runs once the browser has closed, so Chromium's
 * memory is free for it. Once `signal` aborts, no further encode starts: an
 * encode under way can't be stopped, but a smaller retry is skipped.
 */
async function stitch(
  width: number,
  { shots, height, partial }: SliceShots<SliceImage>,
  signal: AbortSignal,
  log: StepLog,
): Promise<CapturedImage> {
  try {
    log(`stitching ${width}x${height}, ${rssMb()} MB RSS`);
    const jpegs = await sizedSlices(shots, width);
    const render = slicesRenderer(jpegs, width, height);
    const { image, scale } = await shrinkToFit(
      (at, quality) => {
        if (signal.aborted) throw new CaptureError("timeout");
        return render(at, quality);
      },
      "stitched",
      log,
    );
    log(`${rssMb()} MB RSS after stitching`);
    return {
      body: new Uint8Array(image),
      contentType: "image/jpeg",
      width,
      height,
      scale,
      ...(partial ? { partial: true as const } : {}),
    };
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    log(`stitch failed: ${safeError(error)} (${rssMb()} MB RSS)`);
    throw new CaptureError("failed");
  }
}

function memFreeMb(): number {
  return Math.round(freemem() / 1_048_576);
}

function rssMb(): number {
  return Math.round(process.memoryUsage.rss() / 1_048_576);
}

/** Rejects if Chromium exits mid-capture: its pending protocol calls would otherwise never settle. */
function whenGone(browser: Browser): Promise<never> {
  const gone = new Promise<never>((_, reject) => {
    browser.once("disconnected", () => reject(new Error("Chromium exited")));
  });
  gone.catch(() => undefined);
  return gone;
}

async function snapshot(
  browser: Browser,
  proxy: GuardProxy,
  url: URL,
  width: number,
  stop: AbortSignal,
  log: StepLog,
): Promise<Shot> {
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    acceptDownloads: false,
    // `<-loopback>` drops Chromium's built-in exception, so even localhost goes through the proxy.
    proxy: { server: proxy.server, bypass: "<-loopback>" },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.on("crash", () => log("page crashed"));
  log("page");
  await load(page, url, proxy, stop, log);
  await refuseLoginPage(page, url, log);
  return shoot(page, width, stop, log);
}

/** One capture in its own browser; aborting `signal` closes it, ending any step still waiting. */
async function captureInBrowser(
  url: URL,
  width: number,
  signal: AbortSignal,
  stop: AbortSignal,
  log: StepLog,
): Promise<Shot> {
  const proxy = await startGuardProxy();
  const launched = await launchBrowser(log, signal).catch((error: unknown) => {
    proxy.close();
    throw error;
  });
  const { browser } = launched;
  const close = () => {
    proxy.close();
    return launched.close();
  };
  const onAbort = () => void close();
  signal.addEventListener("abort", onAbort);
  try {
    signal.throwIfAborted();
    return await Promise.race([snapshot(browser, proxy, url, width, stop, log), whenGone(browser)]);
  } catch (error) {
    if (signal.aborted) throw new CaptureError("timeout");
    if (error instanceof CaptureError) throw error;
    log(`error: ${safeError(error)} (${tmpFreeMb()} MB free in /tmp)`);
    throw new CaptureError("failed");
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Close before answering: a function is frozen after its response, which would leave
    // this Chromium running into the next request. Takes at most CLOSE_LIMIT_MS.
    await close();
  }
}

/**
 * Runs the browser in this capture's turn. Whatever a hung browser does, the
 * turn ends `CLOSE_LIMIT_MS` after an abort: by then it has closed or been killed.
 */
async function shootInTurn(
  url: URL,
  width: number,
  signal: AbortSignal,
  stop: AbortSignal,
  endTurn: () => void,
  log: StepLog,
): Promise<Shot> {
  const onAbort = () => setTimeout(endTurn, CLOSE_LIMIT_MS).unref();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new CaptureError("timeout");
    log("turn");
    return await captureInBrowser(url, width, signal, stop, log);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Stitches the slices once the browser has closed. The caller's wait ends as
 * soon as `signal` aborts, with a timeout. The turn lasts until sharp is done,
 * so the next capture's Chromium never starts beside an encode still holding
 * hundreds of MB.
 */
function stitchInTurn(
  shot: Extract<Shot, { kind: "slices" }>,
  signal: AbortSignal,
  endTurn: () => void,
  log: StepLog,
): Promise<CapturedImage> {
  if (signal.aborted) {
    log("out of time before stitching");
    endTurn();
    return Promise.reject(new CaptureError("timeout"));
  }
  const stitching = stitch(shot.width, shot.slices, signal, log);
  void stitching.then(endTurn, endTurn);
  return Promise.race([stitching, whenAborted(signal)]);
}

/**
 * Captures a full-page JPEG at `width` CSS px (device scale factor 1) in a
 * headless Chromium whose every connection goes through an address-checking
 * proxy. Waiting for a turn counts toward the caller's `signal`. Once `stop`
 * aborts, the page's remaining waits are cut short, and a long page stops
 * being shot: what's been shot comes back `partial`. It has to abort early
 * enough before `signal` to leave time to close the browser and stitch; a
 * long page still unstitched when `signal` aborts fails with a timeout.
 */
export async function capturePage(
  url: URL,
  width: number,
  signal: AbortSignal,
  stop: AbortSignal,
  log: StepLog,
): Promise<CapturedImage> {
  const endTurn = await browserTurn();
  let shot: Shot;
  try {
    shot = await shootInTurn(url, width, signal, stop, endTurn, log);
  } catch (error) {
    endTurn();
    throw error;
  }
  if (shot.kind === "slices") return stitchInTurn(shot, signal, endTurn, log);
  endTurn();
  return shot.image;
}
