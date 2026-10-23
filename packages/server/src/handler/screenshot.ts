import { decodeBase64 } from "../lib/base64";
import type { Screenshot } from "../storage";
import { MAX_SCREENSHOT_BYTES } from "../types";

export type ScreenshotParseResult =
  { ok: true; screenshot: Screenshot } | { ok: false; status: 400 | 413; error: string };

const DATA_URL = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const SIGNATURES: Record<Screenshot["contentType"], readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

function decodedLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
}

function hasSignature(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Validates a single PNG or JPEG data URL and enforces the decoded size cap. */
export function parseScreenshot(
  dataUrl: string,
  maxBytes: number = MAX_SCREENSHOT_BYTES,
): ScreenshotParseResult {
  const match = DATA_URL.exec(dataUrl);
  const contentType = match?.[1] as Screenshot["contentType"] | undefined;
  const base64 = match?.[2];
  if (!contentType || !base64 || base64.length % 4 !== 0) {
    return { ok: false, status: 400, error: "Screenshot must be a base64 PNG or JPEG data URL" };
  }
  if (decodedLength(base64) > maxBytes) {
    return { ok: false, status: 413, error: "Screenshot exceeds 1.5 MB" };
  }
  const data = decodeBase64(base64);
  if (!hasSignature(data, SIGNATURES[contentType])) {
    return { ok: false, status: 400, error: "Screenshot content does not match its type" };
  }
  return { ok: true, screenshot: { contentType, data } };
}
