import { readStorage, removeStorage, writeStorage } from "./storage";
import { removeSearchParams, toRelativeUrl } from "./url";

export const REVIEW_PARAM = "review";
export const TOKEN_STORAGE_KEY = "pinpoint:review-token";

export function readStoredToken(): string | null {
  const stored = readStorage("sessionStorage", TOKEN_STORAGE_KEY);
  return stored && stored.trim() !== "" ? stored : null;
}

export function clearStoredToken(): void {
  removeStorage("sessionStorage", TOKEN_STORAGE_KEY);
}

/**
 * Reads `?review=<token>` from the current URL, persists it to sessionStorage,
 * and strips it from the address bar so it is not shared or bookmarked.
 * Falls back to a token captured earlier in this tab.
 */
export function captureToken(win: Window = window): string | null {
  const url = new URL(win.location.href);
  if (!url.searchParams.has(REVIEW_PARAM)) return readStoredToken();

  const fromUrl = url.searchParams.get(REVIEW_PARAM)?.trim() ?? "";
  const stripped = toRelativeUrl(removeSearchParams(url.toString(), [REVIEW_PARAM]));
  win.history.replaceState(win.history.state, "", stripped);

  if (fromUrl === "") return readStoredToken();
  writeStorage("sessionStorage", TOKEN_STORAGE_KEY, fromUrl);
  return fromUrl;
}
