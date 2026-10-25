import { checkHost } from "../frame-check/probe";
import { CaptureError } from "./capture-error";
import { capturePage, type CapturedImage } from "./capture-page";
import { captureRemote } from "./remote";

/** The whole capture, from address check to encoded image. */
export const CAPTURE_TIMEOUT_MS = 25_000;
/** Chromium is memory-hungry: captures beyond this per instance are turned away. */
const MAX_CONCURRENT = 2;

let running = 0;

async function captureWithin(url: URL, width: number, signal: AbortSignal): Promise<CapturedImage> {
  const host = await checkHost(url);
  if (host === "private") throw new CaptureError("private-host");
  if (host === "unresolved") throw new CaptureError("unreachable");
  const service = process.env.SQUINT_CAPTURE_URL;
  return service
    ? captureRemote(service, { url: url.toString(), width }, signal)
    : capturePage(url, width, signal);
}

/**
 * Captures `url` at `width` CSS px. The top-level address is checked here; the
 * local browser also checks every request the page makes. Runs at most
 * `MAX_CONCURRENT` at once and gives up after `CAPTURE_TIMEOUT_MS`.
 */
export async function capture(url: URL, width: number): Promise<CapturedImage> {
  if (running >= MAX_CONCURRENT) throw new CaptureError("busy");
  running += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
  try {
    return await captureWithin(url, width, controller.signal);
  } finally {
    clearTimeout(timer);
    running -= 1;
  }
}
