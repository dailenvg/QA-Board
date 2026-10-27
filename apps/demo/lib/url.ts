export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/** A scheme such as `https:`, but not `localhost:3000`, which is a host and port. */
const SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;
const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i;

/**
 * Normalizes what someone types into an address field: trims, adds a scheme
 * when it is missing (https, or http for local addresses), and accepts only
 * http(s) URLs with a real host.
 */
export function normalizeUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Enter a website address." };
  const candidate = SCHEME.test(trimmed)
    ? trimmed
    : `${LOCAL_HOST.test(trimmed) ? "http" : "https"}://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a web address. Try example.com." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: "Only http and https addresses can be reviewed. Try one that starts with https://.",
    };
  }
  const host = url.hostname;
  const looksReal = host.includes(".") || host === "localhost" || host.startsWith("[");
  if (!looksReal || url.username || url.password) {
    return { ok: false, error: "That doesn't look like a web address. Try example.com." };
  }
  return { ok: true, url: url.toString() };
}

/** Host without `www.`, or the input when it isn't a URL. */
export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Host and path without `www.` (`acme.example/pricing`), just the host for a site's root. */
export function displayPage(url: string): string {
  try {
    const { pathname, search } = new URL(url);
    const path = `${pathname}${search}`;
    return path === "/" ? displayHost(url) : `${displayHost(url)}${path}`;
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string | null {
  try {
    return new URL("/favicon.ico", url).toString();
  } catch {
    return null;
  }
}

/** File name without its extension, for prefilled project names. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}
