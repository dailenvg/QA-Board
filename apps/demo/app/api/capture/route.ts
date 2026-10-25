import { capture } from "@/lib/capture/capture";
import { CaptureError } from "@/lib/capture/capture-error";
import { captureFailure } from "@/lib/capture/http";
import { parseCaptureInput } from "@/lib/capture/input";
import { clientAddress, createRateLimiter } from "@/lib/capture/rate-limit";
import { CAPTURE_HEADERS } from "@/lib/capture/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The capture itself stops at 25s; the rest is headroom for a cold Chromium start. */
export const maxDuration = 60;

const MAX_BODY_CHARS = 4096;
const NO_STORE = { "cache-control": "no-store" };

const limit = createRateLimiter({ limit: 10, windowMs: 60_000 });

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * `POST /api/capture` `{ url, width }`: a full-page JPEG of a public website,
 * with its page size in CSS px in the `x-capture-width` / `x-capture-height`
 * headers. Errors are `{ error: <code> }`.
 */
export async function POST(request: Request) {
  const decision = limit(clientAddress(request.headers), Date.now());
  if (!decision.ok) {
    return captureFailure("rate-limited", { "retry-after": String(decision.retryAfterSeconds) });
  }
  const input = parseCaptureInput(await readBody(request));
  if (!input.ok) return captureFailure("invalid-request");
  try {
    const image = await capture(input.url, input.width);
    return new Response(image.body, {
      headers: {
        ...NO_STORE,
        "content-type": image.contentType,
        "x-content-type-options": "nosniff",
        [CAPTURE_HEADERS.width]: String(image.width),
        [CAPTURE_HEADERS.height]: String(image.height),
        [CAPTURE_HEADERS.scale]: String(image.scale),
      },
    });
  } catch (error) {
    return captureFailure(error instanceof CaptureError ? error.code : "failed");
  }
}
