import { checkHost } from "../frame-check/probe";
import { CLOSE_LIMIT_MS } from "./browser";
import { CaptureError } from "./capture-error";
import { capturePage, type CapturedImage } from "./capture-page";
import { delay } from "./delay";
import { captureRemote } from "./remote";
import { safeError } from "./safe-error";
import { stepLog, type StepLog } from "./step-log";
import { tmpFreeMb } from "./tmp-space";
import { whenAborted } from "./when-aborted";

/**
 * The whole capture, from address check to encoded image. Past it the capture
 * is aborted: its browser closes and the answer is a timeout. With `SETTLE_MS`
 * on top that's under 50 s, inside the routes' 60 s limit.
 */
export const CAPTURE_TIMEOUT_MS = 45_000;
/** Kept back from the budget for stitching and encoding a long page once its browser has closed. */
const STITCH_RESERVE_MS = 7_000;
/**
 * When a capture stops waiting on the page and a long page stops being shot
 * (35 s): what's been shot by then is stitched and returned as partial. Leaves
 * time to close the browser (`CLOSE_LIMIT_MS`) and to stitch before the abort.
 */
export const STOP_SLICING_MS = CAPTURE_TIMEOUT_MS - CLOSE_LIMIT_MS - STITCH_RESERVE_MS;
/** Chromium is memory-hungry: captures beyond this per instance are turned away. */
const MAX_CONCURRENT = 2;
/** After a timeout, how long the answer waits for the capture to close its browser. */
export const SETTLE_MS = CLOSE_LIMIT_MS + 500;

let running = 0;

async function captureWithin(
  url: URL,
  width: number,
  signal: AbortSignal,
  stop: AbortSignal,
  log: StepLog,
): Promise<CapturedImage> {
  const host = await checkHost(url);
  log("host check");
  if (host === "private") throw new CaptureError("private-host");
  if (host === "unresolved") throw new CaptureError("unreachable");
  const service = process.env.SQUINT_CAPTURE_URL;
  return service
    ? captureRemote(service, { url: url.toString(), width }, signal)
    : capturePage(url, width, signal, stop, log);
}

/**
 * Rejects with a `timeout` once `signal` has aborted and `work` has settled
 * (its browser closed), or `SETTLE_MS` later at most, so a step that misses
 * the abort can't hold the response, and a function frozen after answering
 * doesn't keep Chromium open.
 */
async function timeoutAfterAbort(signal: AbortSignal, work: Promise<unknown>): Promise<never> {
  await whenAborted(signal).catch(() => undefined);
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  await Promise.race([settled, delay(SETTLE_MS, undefined)]);
  throw new CaptureError("timeout");
}

/**
 * Captures `url` at `width` CSS px. The top-level address is checked here; the
 * local browser also checks every request the page makes. Runs at most
 * `MAX_CONCURRENT` at once. A long page still being shot at `STOP_SLICING_MS`
 * comes back partial; anything still running at `CAPTURE_TIMEOUT_MS` fails.
 */
export async function capture(url: URL, width: number): Promise<CapturedImage> {
  if (running >= MAX_CONCURRENT) throw new CaptureError("busy");
  running += 1;
  const log = stepLog(`${crypto.randomUUID().slice(0, 4)} w${width}`);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    log(`timed out (${tmpFreeMb()} MB free in /tmp)`);
    controller.abort();
  }, CAPTURE_TIMEOUT_MS);
  const stopSlicing = new AbortController();
  const stopTimer = setTimeout(() => {
    log("stop slicing");
    stopSlicing.abort();
  }, STOP_SLICING_MS);
  try {
    const work = captureWithin(url, width, controller.signal, stopSlicing.signal, log);
    const image = await Promise.race([work, timeoutAfterAbort(controller.signal, work)]);
    log(image.partial ? "done (partial)" : "done");
    return image;
  } catch (error) {
    log(`failed: ${error instanceof CaptureError ? error.code : safeError(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(stopTimer);
    running -= 1;
  }
}
