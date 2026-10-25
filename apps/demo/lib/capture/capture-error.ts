import type { CaptureErrorCode } from "./types";

/** A capture failure with the code the API reports. */
export class CaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(code);
    this.name = "CaptureError";
  }
}
