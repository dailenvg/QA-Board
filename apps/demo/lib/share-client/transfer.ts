import { SHARE_LIMITS } from "../share/limits";

const PART = SHARE_LIMITS.transferBytes;

export type Fetched = { ok: true; blob: Blob } | { ok: false; permanent: boolean };

/**
 * Whether a failed answer will fail again: gone, refused or malformed. Network
 * errors (0), timeouts, rate limits and server errors are worth retrying.
 */
export function isPermanent(status: number): boolean {
  return status !== 0 && status !== 408 && status !== 429 && status < 500;
}

const failed = (status: number): Fetched => ({ ok: false, permanent: isPermanent(status) });

/**
 * Downloads an image in byte ranges of at most 4 MB, so no single response
 * exceeds Vercel's 4.5 MB limit, and joins them. A failure says whether
 * trying again could help.
 */
export async function fetchInRanges(url: string, init: RequestInit = {}): Promise<Fetched> {
  const parts: Blob[] = [];
  let start = 0;
  let total = Infinity;
  let type = "";
  while (start < total) {
    const headers = new Headers(init.headers);
    headers.set("range", `bytes=${start}-${start + PART - 1}`);
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, cache: "no-store" });
    } catch {
      return failed(0);
    }
    if (response.status === 200) return { ok: true, blob: await response.blob() };
    if (response.status !== 206) return failed(response.status);
    const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.headers.get("content-range") ?? "");
    if (!range?.[2] || !range[3] || Number(range[1]) !== start) return failed(500);
    type = response.headers.get("content-type") ?? type;
    parts.push(await response.blob());
    start = Number(range[2]) + 1;
    total = Number(range[3]);
  }
  return { ok: true, blob: new Blob(parts, { type }) };
}

/** Splits a blob into upload parts of at most 4 MB (one part when it's small). */
export function uploadParts(blob: Blob): Blob[] {
  const count = Math.max(1, Math.ceil(blob.size / PART));
  return Array.from({ length: count }, (_, index) => blob.slice(index * PART, (index + 1) * PART));
}
