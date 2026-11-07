import type { z } from "zod";
import { json, readBytes, validate, type Parsed } from "../share/http";
import { WORKSPACE_LIMITS } from "./limits";
import type { Refusal } from "./query-result";

/** How each refusal answers. Nothing here says whether another workspace has the thing. */
const STATUS: Record<Refusal, number> = {
  "not-found": 404,
  "not-uploaded": 404,
  exists: 409,
  cycle: 409,
  "not-empty": 409,
  linked: 409,
  "unknown-folder": 422,
  "unknown-parent": 422,
  "unknown-surface": 422,
  quota: 413,
  "too-large": 413,
  "wrong-kind": 415,
};

export function refusal(reason: Refusal): Response {
  return json({ error: reason }, STATUS[reason]);
}

export function notFound(): Response {
  return refusal("not-found");
}

/** True for `application/json`, with or without parameters. */
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** True for a body a cross-site form can't send: an image type or raw bytes. */
export function isBytesRequest(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "application/octet-stream" || type.startsWith("image/");
}

/** A JSON body of at most `max` bytes, as parsed: 413, or 400 `invalid-json`. */
export async function readJsonValue(
  request: Request,
  max: number = WORKSPACE_LIMITS.jsonBytes,
): Promise<Parsed<unknown>> {
  const bytes = await readBytes(request, max);
  if (!bytes) return { ok: false, response: json({ error: "too-large" }, 413) };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, response: json({ error: "invalid-json" }, 400) };
  }
}

/** A JSON body of at most `max` bytes, validated: 413, 400 `invalid-json`, or 400 `invalid` with the field. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  max: number = WORKSPACE_LIMITS.jsonBytes,
): Promise<Parsed<T>> {
  const body = await readJsonValue(request, max);
  return body.ok ? validate(schema, body.value) : body;
}

/** A route parameter that must fit `schema` (an id, a blob key); null answers 404 like an unknown one. */
export function param<T>(schema: z.ZodType<T>, value: string): T | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
