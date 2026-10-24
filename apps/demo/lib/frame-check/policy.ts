interface HeaderReader {
  get(name: string): string | null;
}

export type FramingBlock = "x-frame-options" | "csp";

const DEFAULT_PORT: Record<string, string> = { "http:": "80", "https:": "443" };
const HOST_SOURCE =
  /^(?:(?<scheme>[a-z][a-z\d+.-]*):\/\/)?(?<wildcard>\*\.)?(?<host>[^:/]+)(?::(?<port>\d+|\*))?(?:\/.*)?$/i;

/** `frame-ancestors` source lists, one per enforced policy that declares the directive. */
export function frameAncestorLists(csp: string | null): string[][] {
  if (!csp) return [];
  const lists: string[][] = [];
  for (const policy of csp.split(",")) {
    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() === "frame-ancestors") {
        lists.push(sources.map((source) => source.toLowerCase()));
        break;
      }
    }
  }
  return lists;
}

function portOf(url: URL): string {
  return url.port || DEFAULT_PORT[url.protocol] || "";
}

function sourceMatches(source: string, target: URL, app: URL | null): boolean {
  if (source === "*") return true;
  if (!app) return false;
  if (source === "'self'") return target.origin === app.origin;
  if (/^[a-z][a-z\d+.-]*:$/.test(source)) {
    return source === app.protocol || (source === "http:" && app.protocol === "https:");
  }
  const match = HOST_SOURCE.exec(source);
  const groups = match?.groups;
  if (!groups?.host) return false;
  if (groups.scheme) {
    const scheme = `${groups.scheme}:`;
    if (scheme !== app.protocol && !(scheme === "http:" && app.protocol === "https:")) return false;
  }
  const host = groups.host;
  const hostOk = groups.wildcard ? app.hostname.endsWith(`.${host}`) : app.hostname === host;
  if (!hostOk) return false;
  if (groups.port === "*") return true;
  const port = groups.port ?? DEFAULT_PORT[groups.scheme ? `${groups.scheme}:` : app.protocol];
  return port === portOf(app);
}

/**
 * Whether the response forbids being framed by `appOrigin`. A CSP
 * `frame-ancestors` directive wins over `X-Frame-Options`, as in browsers.
 */
export function framingBlock(
  headers: HeaderReader,
  target: URL,
  appOrigin: string | null,
): FramingBlock | null {
  const app = appOrigin ? new URL(appOrigin) : null;
  const lists = frameAncestorLists(headers.get("content-security-policy"));
  if (lists.length > 0) {
    const allowed = lists.every((sources) =>
      sources.some((source) => sourceMatches(source, target, app)),
    );
    return allowed ? null : "csp";
  }
  const xfo = headers.get("x-frame-options");
  if (!xfo) return null;
  const values = xfo.split(",").map((value) => value.trim().toLowerCase());
  if (values.includes("deny")) return "x-frame-options";
  if (values.includes("sameorigin") && target.origin !== app?.origin) return "x-frame-options";
  return null;
}
