import type { ErrorResponse } from "../types";

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function errorResponse(
  status: number,
  error: string,
  headers: Record<string, string> = {},
): Response {
  const body: ErrorResponse = { error };
  return json(status, body, headers);
}
