import { TOKEN_HEADER } from "../types";

const encoder = new TextEncoder();

/** Token from `x-pinpoint-token` or `Authorization: Bearer <token>`, else null. */
export function readToken(headers: Headers): string | null {
  const direct = headers.get(TOKEN_HEADER)?.trim();
  if (direct) return direct;
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1]?.trim();
  return bearer ? bearer : null;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/**
 * Constant-time comparison. Both sides are hashed first so neither the
 * content nor the length of the expected token leaks through timing.
 */
export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
