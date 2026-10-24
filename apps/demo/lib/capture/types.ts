/** Shared by `POST /api/capture`, its client, and any external service behind `SQUINT_CAPTURE_URL`. */

export interface CaptureRequest {
  url: string;
  /** Page width in CSS px; clamped to `CAPTURE_LIMITS`. */
  width: number;
}

export const CAPTURE_LIMITS = {
  minWidth: 320,
  maxWidth: 2560,
  /** Taller pages are cut off here. */
  maxHeight: 16_000,
} as const;

/** The image body's page size in CSS px travels in these response headers. */
export const CAPTURE_HEADERS = { width: "x-capture-width", height: "x-capture-height" } as const;

export const CAPTURE_ERROR_CODES = [
  "invalid-request",
  "private-host",
  "unreachable",
  "timeout",
  "rate-limited",
  "busy",
  "unavailable",
  "failed",
] as const;

export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[number];

/** Error body: `{ "error": "<code>" }`. */
export interface CaptureErrorBody {
  error: CaptureErrorCode;
}

export function isCaptureErrorCode(value: unknown): value is CaptureErrorCode {
  return (CAPTURE_ERROR_CODES as readonly unknown[]).includes(value);
}

export function clampWidth(width: number): number {
  return Math.min(CAPTURE_LIMITS.maxWidth, Math.max(CAPTURE_LIMITS.minWidth, Math.round(width)));
}
