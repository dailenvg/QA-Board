/** Query params the widget uses. Mirrors `PIN_PARAM` / `REVIEW_PARAM` in `@pinpoint/widget`. */
export const PIN_PARAM = "pin";
export const REVIEW_PARAM = "review";

/**
 * Builds `<origin><path>?…&pin=<id>`. The origin always comes from the server
 * (env or request), never from the client, so a deep link posted to GitHub
 * cannot point at a foreign site. Only the query and hash of `pageUrl` are kept,
 * minus the review token.
 */
export function buildDeepLink(
  origin: string,
  path: string,
  pageUrl: string,
  pinId: string,
): string {
  const page = new URL(pageUrl);
  const link = new URL(path, origin);
  for (const [key, value] of page.searchParams) {
    if (key !== REVIEW_PARAM && key !== PIN_PARAM) link.searchParams.append(key, value);
  }
  link.searchParams.set(PIN_PARAM, pinId);
  link.hash = page.hash;
  return link.toString();
}
