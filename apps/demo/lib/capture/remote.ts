import { CaptureError } from "./capture-error";
import type { CapturedImage } from "./capture-page";
import { CAPTURE_HEADERS, CAPTURE_LIMITS, isCaptureErrorCode, type CaptureRequest } from "./types";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function readSize(headers: Headers, name: string, max: number): number {
  const value = Number(headers.get(name));
  if (!Number.isInteger(value) || value < 1 || value > max) throw new CaptureError("failed");
  return value;
}

async function errorCode(response: Response): Promise<CaptureError> {
  const body: unknown = await response.json().catch(() => null);
  const code = typeof body === "object" && body !== null && "error" in body ? body.error : null;
  return new CaptureError(isCaptureErrorCode(code) ? code : "failed");
}

/** Delegates to an external capture service (`SQUINT_CAPTURE_URL`) that speaks the same contract. */
export async function captureRemote(
  serviceUrl: string,
  input: CaptureRequest,
  signal: AbortSignal,
): Promise<CapturedImage> {
  let response: Response;
  try {
    response = await fetch(serviceUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch {
    throw new CaptureError(signal.aborted ? "timeout" : "unavailable");
  }
  if (!response.ok) throw await errorCode(response);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new CaptureError("failed");
  const width = readSize(response.headers, CAPTURE_HEADERS.width, CAPTURE_LIMITS.maxWidth);
  const height = readSize(response.headers, CAPTURE_HEADERS.height, CAPTURE_LIMITS.maxHeight);
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) throw new CaptureError("failed");
  return { body, contentType, width, height };
}
