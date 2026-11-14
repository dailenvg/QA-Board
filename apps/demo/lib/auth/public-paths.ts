/**
 * Paths anyone can open without signing in. Everything else needs a session
 * cookie (middleware.ts), and the server checks the session itself
 * (`lib/auth/guards.ts`): this list only decides who gets sent to /login.
 * No Node imports: middleware runs on the edge.
 */

/** Exact paths. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/sandbox",
  "/review-link",
  "/api/pinpoint",
  // Shared review links show website projects through the same viewer, which asks this.
  "/api/frame-check",
  "/icon.svg",
  "/favicon.ico",
  "/opengraph-image",
  "/twitter-image",
]);

/** A path and everything under it: `/s` covers `/s` and `/s/<token>`, not `/sx`. */
const PUBLIC_TREES = [
  "/reset",
  // Email change links: opened from the new address's inbox, often in another browser.
  "/email-change",
  "/s",
  "/px/s",
  "/embed",
  "/api/shares",
  "/api/s",
  "/api/cron",
  "/api/auth",
  "/pdfjs",
  "/_next",
  "/_vercel",
  "/__nextjs",
];

/**
 * Single routes inside a private tree. Vercel Blob's upload callback carries
 * no cookie: the route checks its signature, and a member's session for
 * everything else it does. A project link's preview card and company icon
 * are read by link unfurlers, which never sign in: each shows the company's
 * and the project's names only, or Squint's own card.
 */
const PUBLIC_PATTERNS = [
  /^\/api\/w\/[^/]+\/blobs\/token$/,
  /^\/p\/[^/]+\/(?:opengraph|twitter)-image$/,
  /^\/api\/p\/[^/]+\/brand\/icon$/,
];

/**
 * Pages that answer a browser without a session themselves instead of
 * sending it to /login: a project's link (`/p/<id>`, exactly, nothing under
 * it) shows whose project it is and Sign in, so it can unfurl. With a
 * session cookie they're handled as any private page (the path passed on,
 * the cookie renewed).
 */
const SIGNED_OUT_PAGES = [/^\/p\/[^/]+$/];

/** `pathname` without trailing slashes (except the root's). */
function trimmed(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function opensSignedOut(pathname: string): boolean {
  const path = trimmed(pathname);
  return SIGNED_OUT_PAGES.some((pattern) => pattern.test(path));
}

export function isPublicPath(pathname: string): boolean {
  const path = trimmed(pathname);
  if (PUBLIC_PATHS.has(path)) return true;
  if (PUBLIC_PATTERNS.some((pattern) => pattern.test(path))) return true;
  return PUBLIC_TREES.some((tree) => path === tree || path.startsWith(`${tree}/`));
}
