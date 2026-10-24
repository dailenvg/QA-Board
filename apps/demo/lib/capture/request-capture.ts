import type { CaptureFailure } from "./messages";
import { CAPTURE_HEADERS, isCaptureErrorCode } from "./types";

export type CaptureResult =
  | { ok: true; blob: Blob; width: number; height: number; scale: number }
  | { ok: false; failure: CaptureFailure };

async function failureOf(response: Response): Promise<CaptureFailure> {
  const body: unknown = await response.json().catch(() => null);
  const code = typeof body === "object" && body !== null && "error" in body ? body.error : null;
  return isCaptureErrorCode(code) ? code : "failed";
}

function size(response: Response, header: string): number | null {
  const value = Number(response.headers.get(header));
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Asks `/api/capture` for a full-page image of `url` at `width` CSS px. */
export async function requestCapture(
  url: string,
  width: number,
  signal: AbortSignal,
): Promise<CaptureResult> {
  let response: Response;
  try {
    response = await fetch("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, width }),
      signal,
    });
  } catch {
    return { ok: false, failure: "offline" };
  }
  if (!response.ok) return { ok: false, failure: await failureOf(response) };
  const pageWidth = size(response, CAPTURE_HEADERS.width);
  const pageHeight = size(response, CAPTURE_HEADERS.height);
  const blob = await response.blob().catch(() => null);
  if (!blob?.type.startsWith("image/") || !pageWidth || !pageHeight) {
    return { ok: false, failure: "failed" };
  }
  const scale = Number(response.headers.get(CAPTURE_HEADERS.scale) ?? 1);
  return {
    ok: true,
    blob,
    width: pageWidth,
    height: pageHeight,
    scale: scale > 0 && scale <= 1 ? scale : 1,
  };
}
