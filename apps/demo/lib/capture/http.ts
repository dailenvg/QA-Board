import type { CaptureErrorBody, CaptureErrorCode } from "./types";

/** `POST /api/capture`'s brake, per address and server instance: each one starts Chromium. */
export const CAPTURE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const STATUS: Record<CaptureErrorCode, number> = {
  "invalid-request": 400,
  "private-host": 403,
  unreachable: 502,
  timeout: 504,
  "rate-limited": 429,
  busy: 503,
  unavailable: 503,
  // The request was fine and the site answered; what it answered with can't be reviewed.
  "login-page": 422,
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
