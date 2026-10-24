import { clampWidth } from "./types";

const MAX_URL_LENGTH = 2048;

export type CaptureInput = { ok: true; url: URL; width: number } | { ok: false };

const INVALID: CaptureInput = { ok: false };

/** Validates a capture request body: an http(s) URL without credentials, and a numeric width. */
export function parseCaptureInput(body: unknown): CaptureInput {
  if (typeof body !== "object" || body === null) return INVALID;
  const { url, width } = body as Record<string, unknown>;
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH) return INVALID;
  if (typeof width !== "number" || !Number.isFinite(width)) return INVALID;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return INVALID;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return INVALID;
  if (parsed.username || parsed.password) return INVALID;
  return { ok: true, url: parsed, width: clampWidth(width) };
}
