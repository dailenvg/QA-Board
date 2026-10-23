/** Returns `href` without the given query params, preserving everything else. */
export function removeSearchParams(href: string, params: readonly string[]): string {
  const url = new URL(href);
  for (const param of params) url.searchParams.delete(param);
  return url.toString();
}

/** Path + query + hash of an absolute URL, suitable for `history.replaceState`. */
export function toRelativeUrl(href: string): string {
  const url = new URL(href);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Keys a router uses to mark its own history writes. The Next.js App Router
 * patches `replaceState` and skips syncing its URL state when it sees them.
 */
const ROUTER_INTERNAL_MARKERS = ["__NA", "_N"] as const;

function withoutRouterMarkers(state: unknown): unknown {
  if (typeof state !== "object" || state === null) return state;
  const copy: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  for (const marker of ROUTER_INTERNAL_MARKERS) delete copy[marker];
  return copy;
}

/**
 * `history.replaceState` that keeps the current state. When a router has
 * patched `replaceState` (Next.js App Router), its internal-call markers are
 * dropped so the router treats this as an external change, re-adds its own
 * state, and updates its idea of the current URL. Unpatched history keeps
 * the state exactly as it was.
 */
export function replaceUrl(win: Window, url: string): void {
  const patched = win.history.replaceState !== History.prototype.replaceState;
  const state: unknown = win.history.state;
  win.history.replaceState(patched ? withoutRouterMarkers(state) : state, "", url);
}
