import type { z } from "zod";
import { clientAddress, createRateLimiter } from "../capture/rate-limit";
import { SHARE_LIMITS } from "./schemas";
import type { Failure } from "./service";

export { OWNER_KEY_HEADER } from "./http-headers";

const NO_STORE = { "cache-control": "no-store" };

/** Per-IP brakes, per server instance. */
const LIMITS = {
  create: createRateLimiter({ limit: 10, windowMs: 60_000 }),
  ownerWrite: createRateLimiter({ limit: 300, windowMs: 60_000 }),
  ownerRead: createRateLimiter({ limit: 600, windowMs: 60_000 }),
  clientComment: createRateLimiter({ limit: 20, windowMs: 60_000 }),
  clientCapture: createRateLimiter({ limit: 6, windowMs: 60_000 }),
  clientRead: createRateLimiter({ limit: 600, windowMs: 60_000 }),
};

export type LimitName = keyof typeof LIMITS;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Unknown share, revoked link and wrong key all answer the same, saying nothing more. */
export function notFound(): Response {
  return json({ error: "not-found" }, 404);
}

export function failure({ status, error }: Failure): Response {
  return json({ error }, status);
}

/** A 429 when the caller is over `name`'s limit, else null. */
export function rateLimit(request: Request, name: LimitName): Response | null {
  const decision = LIMITS[name](clientAddress(request.headers), Date.now());
  if (decision.ok) return null;
  return Response.json(
    { error: "rate-limited" },
    { status: 429, headers: { ...NO_STORE, "retry-after": String(decision.retryAfterSeconds) } },
  );
}

/** Reads at most `max` bytes of the body; null when it's bigger. */
export async function readBytes(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Parses a JSON value with a zod schema; 400 with the first issue's path when it doesn't fit. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.join(".") || "body";
  return { ok: false, response: json({ error: "invalid", field: where }, 400) };
}

/** A JSON body, size-limited, validated. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<Parsed<T>> {
  const bytes = await readBytes(request, SHARE_LIMITS.jsonBytes);
  if (!bytes) return { ok: false, response: json({ error: "too-large" }, 413) };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, response: json({ error: "invalid-json" }, 400) };
  }
  return validate(schema, value);
}

const IMAGE_HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
  "accept-ranges": "bytes",
};

/** `bytes=<start>-<end?>` from a Range header; null when absent or not a single plain range. */
export function parseRange(
  header: string | null,
  total: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match?.[1]) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : total - 1;
  return start <= end && start < total ? { start, end: Math.min(end, total - 1) } : null;
}

/**
 * Image bytes for a browser: private, never cached, never sniffed, inert if
 * opened directly. A `Range` request gets at most `SHARE_LIMITS.transferBytes`
 * (206), so big images download in parts under Vercel's 4.5 MB response limit.
 */
export function imageResponse(
  bytes: Uint8Array,
  contentType: string,
  range: string | null,
): Response {
  const total = bytes.length;
  const wanted = parseRange(range, total);
  if (range && !wanted && total > 0) {
    return new Response(null, {
      status: 416,
      headers: { ...IMAGE_HEADERS, "content-range": `bytes */${total}` },
    });
  }
  if (!wanted) {
    return new Response(new Uint8Array(bytes), {
      headers: { ...IMAGE_HEADERS, "content-type": contentType },
    });
  }
  const end = Math.min(wanted.end, wanted.start + SHARE_LIMITS.transferBytes - 1);
  return new Response(bytes.slice(wanted.start, end + 1), {
    status: 206,
    headers: {
      ...IMAGE_HEADERS,
      "content-type": contentType,
      "content-range": `bytes ${wanted.start}-${end}/${total}`,
    },
  });
}
