/**
 * Where to go after signing in: the `next` query parameter, carried from the
 * page that sent the browser to /login. Client-safe.
 */

/** Set by middleware on protected requests: the path and query asked for. */
export const PATH_HEADER = "x-squint-path";

/** Added to the destination after signing in, once: Squiggy greets, then it's removed. */
export const WELCOME_PARAM = "welcome";

/** The welcome flag's value: the user's first sign-in, or a return. */
export type Welcome = "first" | "back";

const BASE = "http://squint.invalid";

/**
 * `value` when it's a path on this site (not /login, not an API route), else
 * "/". Refuses anything that would leave the site: `//host`, `/\host`,
 * absolute URLs.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  const { pathname } = url;
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/api/")) {
    return "/";
  }
  return `${pathname}${url.search}${url.hash}`;
}

/** /login, with `next` when there's somewhere other than the Overview to return to. */
export function loginHref(next?: string | null): string {
  const path = safeNextPath(next);
  return path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`;
}

/** `path` (already safe) with `params` added to its query. */
export function withParams(path: string, params: Record<string, string>): string {
  const url = new URL(path, BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `path` (already safe) with the one-shot welcome flag. */
export function withWelcome(path: string, welcome: Welcome): string {
  return withParams(path, { [WELCOME_PARAM]: welcome });
}
