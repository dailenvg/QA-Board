import { lookup } from "node:dns/promises";
import { isBlockedAddress, isBlockedHostname, isIpLiteral } from "./address";
import { framingBlock } from "./policy";
import type { FrameCheckResult } from "./types";

const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; SquintFrameCheck/1.0)";

type HostCheck = "public" | "private" | "unresolved";

/** Resolves the host and refuses anything that lands on a private or local address. */
async function checkHost(url: URL): Promise<HostCheck> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host)) return "private";
  if (isIpLiteral(host)) return isBlockedAddress(host) ? "private" : "public";
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return "unresolved";
    return addresses.some(({ address }) => isBlockedAddress(address)) ? "private" : "public";
  } catch {
    return "unresolved";
  }
}

async function request(url: URL, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    method,
    redirect: "manual",
    signal,
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
  });
  // Only headers matter; never download the body.
  await response.body?.cancel().catch(() => undefined);
  return response;
}

/** HEAD first; some servers reject it or answer without their real headers, so fall back to GET. */
async function fetchHeaders(url: URL, signal: AbortSignal): Promise<Response> {
  try {
    const head = await request(url, "HEAD", signal);
    if (head.status !== 405 && head.status !== 501 && head.status !== 403) return head;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return request(url, "GET", signal);
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304;
}

/**
 * Fetches a URL server-side, following a few redirects (each re-checked
 * against private networks), and reports whether its headers forbid framing.
 */
export async function probeFraming(
  input: string,
  appOrigin: string | null,
): Promise<FrameCheckResult> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { verdict: "unknown", reason: "invalid-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { verdict: "unknown", reason: "invalid-url" };
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const host = await checkHost(url);
      if (host === "private") return { verdict: "unknown", reason: "private-host" };
      if (host === "unresolved") return { verdict: "unreachable", reason: "network" };
      const response = await fetchHeaders(url, signal);
      const location = response.headers.get("location");
      if (isRedirect(response.status) && location) {
        url = new URL(location, url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { verdict: "unknown", reason: "invalid-url" };
        }
        continue;
      }
      const block = framingBlock(response.headers, url, appOrigin);
      return block
        ? { verdict: "blocked", reason: block, finalUrl: url.toString() }
        : { verdict: "embeddable", finalUrl: url.toString(), status: response.status };
    }
    return { verdict: "unreachable", reason: "too-many-redirects" };
  } catch {
    return { verdict: "unreachable", reason: signal.aborted ? "timeout" : "network" };
  }
}
