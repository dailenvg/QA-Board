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

/** The whole capture, from address check to encoded image. */
export const CAPTURE_TIMEOUT_MS = 25_000;
/** Chromium is memory-hungry: captures beyond this per instance are turned away. */
const MAX_CONCURRENT = 2;
/** After a timeout, how long the answer waits for the capture to close its browser. */
export const SETTLE_MS = CLOSE_LIMIT_MS + 500;

let running = 0;

async function captureWithin(
  url: URL,
  width: number,
  signal: AbortSignal,
  log: StepLog,
): Promise<CapturedImage> {
  const host = await checkHost(url);
  log("host check");
  if (host === "private") throw new CaptureError("private-host");
  if (host === "unresolved") throw new CaptureError("unreachable");
  const service = process.env.SQUINT_CAPTURE_URL;
  return service
    ? captureRemote(service, { url: url.toString(), width }, signal)
    : capturePage(url, width, signal, log);
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
 * `MAX_CONCURRENT` at once and gives up after `CAPTURE_TIMEOUT_MS`.
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
  try {
    const work = captureWithin(url, width, controller.signal, log);
    const image = await Promise.race([work, timeoutAfterAbort(controller.signal, work)]);
    log("done");
    return image;
  } catch (error) {
    log(`failed: ${error instanceof CaptureError ? error.code : safeError(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
    running -= 1;
  }
}
