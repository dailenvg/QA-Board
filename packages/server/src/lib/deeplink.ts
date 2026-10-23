/** Query params the widget uses. Mirrors `PIN_PARAM` / `REVIEW_PARAM` in `@pinpoint/widget`. */
export const PIN_PARAM = "pin";
export const REVIEW_PARAM = "review";

/**
 * Builds `<origin><path>?…&pin=<id>`. The URL is constructed from the server's
 * origin (env or request) and the client path is only ever assigned to
 * `pathname`, so it can never change the host: `//evil.example` or
 * `/\evil.example` become paths on this origin, not protocol-relative URLs.
 * Any query or hash in `path` is dropped; only the query and hash of `pageUrl`
 * are kept, minus the review token.
 */
export function buildDeepLink(
  origin: string,
  path: string,
  pageUrl: string,
  pinId: string,
): string {
  const page = new URL(pageUrl);
  const link = new URL(origin);
  link.pathname = path.split(/[?#]/, 1)[0] ?? "/";
  // Dot segments can normalise to a `//x` path (`/..//x`); a host app that
  // redirects such paths would turn it into an open redirect, so collapse them.
  link.pathname = link.pathname.replace(/^\/+/, "/");
  link.search = "";
  link.hash = "";
  for (const [key, value] of page.searchParams) {
    if (key !== REVIEW_PARAM && key !== PIN_PARAM) link.searchParams.append(key, value);
  }
  link.searchParams.set(PIN_PARAM, pinId);
  link.hash = page.hash;
  return link.toString();
}
