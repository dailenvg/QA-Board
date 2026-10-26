import { checkHost } from "../frame-check/probe";
import { CaptureError } from "./capture-error";
import { capturePage, type CapturedImage } from "./capture-page";
import { captureRemote } from "./remote";
import { stepLog, type StepLog } from "./step-log";
import { tmpFreeMb } from "./tmp-space";

/** The whole capture, from address check to encoded image. */
export const CAPTURE_TIMEOUT_MS = 25_000;
/** Chromium is memory-hungry: captures beyond this per instance are turned away. */
const MAX_CONCURRENT = 2;

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

/** Rejects once `signal` aborts, so a step that misses the abort can't hold the response. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new CaptureError("timeout")), { once: true });
  });
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
    const image = await Promise.race([work, whenAborted(controller.signal)]);
    log("done");
    return image;
  } catch (error) {
    log(`failed: ${error instanceof CaptureError ? error.code : String(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
    running -= 1;
  }
}
