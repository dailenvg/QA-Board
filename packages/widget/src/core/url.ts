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
