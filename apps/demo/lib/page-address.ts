/** Longest page address accepted anywhere (the share schema's limit too). */
export const MAX_PAGE_URL_LENGTH = 2048;

export type PageAddressCheck = { ok: true; url: string } | { ok: false; error: string };

/** A scheme such as `https:`, but not `localhost:3000`, which is a host and port. */
const SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;

function parse(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/**
 * The page an address names: an http(s) URL without credentials or its
 * `#fragment`, which only scrolls within a page. Null when it isn't one.
 * Snapshots and comments are grouped by this, so `/pricing#faq` and
 * `/pricing` are the same page.
 */
export function pageKey(address: string): string | null {
  if (address.length > MAX_PAGE_URL_LENGTH) return null;
  const url = parse(address);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null;
  if (url.username || url.password) return null;
  url.hash = "";
  return url.toString();
}

/** The origin of an http(s) address (`https://acme.example`), or null. */
export function originOf(address: string): string | null {
  const key = pageKey(address);
  return key ? new URL(key).origin : null;
}

/** The page `address` names when it's on the same site (origin) as `projectUrl`, else null. */
export function samePage(address: string, projectUrl: string): string | null {
  const key = pageKey(address);
  const origin = originOf(projectUrl);
  return key && origin && new URL(key).origin === origin ? key : null;
}

/**
 * The address to frame or capture for a page of the project's site (`null`
 * meaning the project's own page). The project's own page is opened at the
 * project's address exactly, `#fragment` included, so a hash-routed app
 * (`/#/checkout`) still opens on its route; any other same-origin page at its
 * `pageKey`. Null for a page on another origin.
 */
export function pageAddress(page: string | null, projectUrl: string): string | null {
  if (page === null) return projectUrl;
  const key = samePage(page, projectUrl);
  if (!key) return null;
  return key === pageKey(projectUrl) ? projectUrl : key;
}

const bareHost = (url: URL) => url.hostname.replace(/^www\./, "");
const portOf = (url: URL) => url.port || (url.protocol === "https:" ? "443" : "80");

/**
 * Whether a capture that asked for `requested` and ended up at `final` (after
 * redirects) stayed on the same site: the same host, give or take a leading
 * `www.`, on the same scheme and port, or upgraded from http to https on the
 * default ports. Ordinary canonical redirects pass; an open redirect to
 * another site doesn't.
 */
export function sameSite(requested: string, final: string): boolean {
  const from = parse(requested);
  const to = parse(final);
  if (!from || !to || bareHost(from) !== bareHost(to)) return false;
  if (from.protocol === to.protocol) return portOf(from) === portOf(to);
  const upgraded = from.protocol === "http:" && to.protocol === "https:";
  return upgraded && !from.port && !to.port;
}

/** Where a page is on its site: `/`, `/pricing`, `/search?q=shoes`. */
export function pagePath(pageUrl: string): string {
  const url = parse(pageUrl);
  return url ? `${url.pathname}${url.search}` : pageUrl;
}

/** The site's host as people know it, for messages: `acme.example`, `localhost:3000`. */
function hostOf(projectUrl: string): string {
  return parse(projectUrl)?.host ?? projectUrl;
}

/**
 * What someone typed or pasted into the page address bar, as a page on the
 * project's site: a path (`/pricing`, `pricing?plan=pro`), or a full address
 * (with or without `https://`) on the same origin. Anything else is refused
 * with a message that says what to type instead.
 */
export function resolvePageAddress(input: string, projectUrl: string): PageAddressCheck {
  const trimmed = input.trim();
  const host = hostOf(projectUrl);
  if (!trimmed) return { ok: false, error: "Enter a page address, such as /pricing." };
  if (trimmed.length > MAX_PAGE_URL_LENGTH) {
    return { ok: false, error: "That address is too long." };
  }
  const elsewhere = `Only pages on ${host} can be reviewed in this project. For a path, start it with /.`;
  const firstSegment = trimmed.split(/[/?#]/, 1)[0] ?? "";
  // "acme.example/pricing" and "localhost:3000/x" name a host; "pricing" and "/pricing" a path.
  const namesHost = !trimmed.startsWith("/") && /[.:]/.test(firstSegment);
  let candidate: URL | null;
  if (SCHEME.test(trimmed)) {
    candidate = parse(trimmed);
    if (candidate && candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return { ok: false, error: "Only http and https pages can be reviewed." };
    }
  } else if (namesHost) {
    candidate = parse(`${parse(projectUrl)?.protocol ?? "https:"}//${trimmed}`);
  } else {
    const path = /^[/?#]/.test(trimmed) ? trimmed : `/${trimmed}`;
    candidate = parse(path, projectUrl);
  }
  if (!candidate) return { ok: false, error: "That doesn't look like a page address." };
  if (candidate.username || candidate.password) {
    return { ok: false, error: "Page addresses can't include a user name or password." };
  }
  const url = samePage(candidate.toString(), projectUrl);
  return url ? { ok: true, url } : { ok: false, error: elsewhere };
}
