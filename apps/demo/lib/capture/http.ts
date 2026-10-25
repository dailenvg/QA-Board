import type { CaptureErrorBody, CaptureErrorCode } from "./types";

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

/** The `{ error: <code> }` response every capture route uses. */
export function captureFailure(code: CaptureErrorCode, headers: Record<string, string> = {}) {
  const body: CaptureErrorBody = { error: code };
  return Response.json(body, {
    status: STATUS[code],
    headers: { "cache-control": "no-store", ...headers },
  });
}
