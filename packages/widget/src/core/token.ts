import { readStorage, removeStorage, writeStorage } from "./storage";
import { removeSearchParams, toRelativeUrl } from "./url";

export const REVIEW_PARAM = "review";
export const TOKEN_STORAGE_KEY = "pinpoint:review-token";
/** How long a captured token is remembered on this device. */
export const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredToken {
  token: string;
  expiresAt: number;
}

function parseStoredToken(raw: string): StoredToken | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const { token, expiresAt } = value as Record<string, unknown>;
    if (typeof token !== "string" || token.trim() === "" || typeof expiresAt !== "number") {
      return null;
    }
    return { token, expiresAt };
  } catch {
    return null;
  }
}

/**
 * The remembered token, or null. Expired or malformed entries are removed.
 * This module is the only place that knows where the token lives.
 */
export function readStoredToken(now: number = Date.now()): string | null {
  const raw = readStorage("localStorage", TOKEN_STORAGE_KEY);
  if (raw === null) return null;
  const stored = parseStoredToken(raw);
  if (!stored || stored.expiresAt <= now) {
    clearStoredToken();
    return null;
  }
  return stored.token;
}

export function storeToken(token: string, now: number = Date.now()): void {
  const value: StoredToken = { token, expiresAt: now + TOKEN_TTL_MS };
  writeStorage("localStorage", TOKEN_STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredToken(): void {
  removeStorage("localStorage", TOKEN_STORAGE_KEY);
}

/**
 * Reads `?review=<token>` from the current URL, remembers it for 14 days
 * (refreshing any earlier token and expiry), and strips it from the address
 * bar so it is not shared or bookmarked. Falls back to a remembered token.
 */
export function captureToken(win: Window = window, now: number = Date.now()): string | null {
  const url = new URL(win.location.href);
  if (!url.searchParams.has(REVIEW_PARAM)) return readStoredToken(now);

  const fromUrl = url.searchParams.get(REVIEW_PARAM)?.trim() ?? "";
  const stripped = toRelativeUrl(removeSearchParams(url.toString(), [REVIEW_PARAM]));
  win.history.replaceState(win.history.state, "", stripped);

  if (fromUrl === "") return readStoredToken(now);
  storeToken(fromUrl, now);
  return fromUrl;
}
