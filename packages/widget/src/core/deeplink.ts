import { REVIEW_PARAM } from "./token";
import { removeSearchParams } from "./url";

export const PIN_PARAM = "pin";

/** Returns the pin id from a query string such as `?pin=abc`, or null. */
export function readPinParam(search: string): string | null {
  const value = new URLSearchParams(search).get(PIN_PARAM)?.trim();
  return value ? value : null;
}

/** Page URL with review and pin params removed; safe to store and share. */
export function cleanPageUrl(href: string): string {
  return removeSearchParams(href, [REVIEW_PARAM, PIN_PARAM]);
}

/** Shareable link that scrolls to and opens `pinId`. Never includes the token. */
export function buildDeepLink(pageUrl: string, pinId: string): string {
  const url = new URL(cleanPageUrl(pageUrl));
  url.searchParams.set(PIN_PARAM, pinId);
  return url.toString();
}
