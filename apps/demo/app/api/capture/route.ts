import { capture } from "@/lib/capture/capture";
import { CaptureError } from "@/lib/capture/capture-error";
import { parseCaptureInput } from "@/lib/capture/input";
import { clientAddress, createRateLimiter } from "@/lib/capture/rate-limit";
import { CAPTURE_HEADERS, type CaptureErrorBody, type CaptureErrorCode } from "@/lib/capture/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The capture itself stops at 25s; the rest is headroom for a cold Chromium start. */
export const maxDuration = 60;

const MAX_BODY_CHARS = 4096;
const NO_STORE = { "cache-control": "no-store" };

const STATUS: Record<CaptureErrorCode, number> = {
  "invalid-request": 400,
  "private-host": 403,
  unreachable: 502,
  timeout: 504,
  "rate-limited": 429,
  busy: 503,
  unavailable: 503,
  failed: 500,
};

const limit = createRateLimiter({ limit: 10, windowMs: 60_000 });

function failure(code: CaptureErrorCode, headers: Record<string, string> = {}): Response {
  const body: CaptureErrorBody = { error: code };
  return Response.json(body, { status: STATUS[code], headers: { ...NO_STORE, ...headers } });
}

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
    return failure("rate-limited", { "retry-after": String(decision.retryAfterSeconds) });
  }
  const input = parseCaptureInput(await readBody(request));
  if (!input.ok) return failure("invalid-request");
  try {
    const image = await capture(input.url, input.width);
    return new Response(image.body, {
      headers: {
        ...NO_STORE,
        "content-type": image.contentType,
        [CAPTURE_HEADERS.width]: String(image.width),
        [CAPTURE_HEADERS.height]: String(image.height),
      },
    });
  } catch (error) {
    return failure(error instanceof CaptureError ? error.code : "failed");
  }
}
