import { createHmac, timingSafeEqual } from "node:crypto";
import { hashSecret, isSecretShape } from "../share/tokens";
import { SESSION_COOKIE } from "./session-cookie";

/**
 * The session cookie's two shapes, and the bridge between them. Pure: nothing
 * here touches the database.
 *
 * - Signed (sessions started by Better Auth): `<token>.<signature>`, the
 *   signature a base64 HMAC-SHA256 of the token under `authSecret`, exactly
 *   as better-call signs cookies (a test pins the format).
 * - Legacy (sessions started before Better Auth): 32 random bytes as
 *   base64url, 43 characters. `sessions.token_hash` holds their sha256, so
 *   that hash, signed, is the token Better Auth looks up.
 */

/** base64 HMAC-SHA256 of `token`: 44 characters, ending in `=`. */
function signatureOf(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("base64");
}

/** The signed value of a session cookie for `token`, before URL encoding. */
export function signSessionToken(token: string, secret: string): string {
  return `${token}.${signatureOf(token, secret)}`;
}

/** The token in a signed cookie value, or null when it isn't signed with `secret`. */
export function verifySessionToken(value: string, secret: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const token = value.slice(0, dot);
  const presented = Buffer.from(value.slice(dot + 1), "utf8");
  const expected = Buffer.from(signatureOf(token, secret), "utf8");
  return presented.length === expected.length && timingSafeEqual(presented, expected)
    ? token
    : null;
}

/**
 * The `Cookie` header to hand Better Auth for a session cookie's (decoded)
 * value: a signed value as it is, a legacy one as its hash signed, and null
 * for anything else (no cookie, a forged signature, junk), which then never
 * reaches the database.
 */
export function authCookieHeader(value: string | null | undefined, secret: string): string | null {
  if (!value) return null;
  const signed = isSecretShape(value)
    ? signSessionToken(hashSecret(value), secret)
    : verifySessionToken(value, secret) && value;
  return signed ? `${SESSION_COOKIE}=${encodeURIComponent(signed)}` : null;
}
