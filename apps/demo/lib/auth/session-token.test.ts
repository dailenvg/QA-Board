import { describe, expect, it } from "vitest";
import { hashSecret } from "../share/tokens";
import { authCookieHeader, signSessionToken, verifySessionToken } from "./session-token";

const SECRET = "a".repeat(64);
const TOKEN = "jXwgD2DFG4E0tx8uOi7jvgvhZire6ANc";
const LEGACY = "x".repeat(43);

/** The token and signature in a `Cookie` header from `authCookieHeader`. */
function signedValueOf(header: string | null): string {
  expect(header).toMatch(/^squint_session=/);
  return decodeURIComponent((header ?? "").slice("squint_session=".length));
}

describe("signSessionToken", () => {
  it("signs as better-call does: the token, a dot, a 44-character base64 HMAC", () => {
    const signed = signSessionToken(TOKEN, SECRET);
    expect(signed).toMatch(/^jXwgD2DFG4E0tx8uOi7jvgvhZire6ANc\.[A-Za-z0-9+/]{43}=$/);
    // HMAC-SHA256 keyed with the secret's UTF-8 bytes, base64: worked out with WebCrypto, as better-call does.
    expect(signed).toBe(`${TOKEN}.eUp1xzYPzorh35RwF0bmxQrxVD/vV+kyLoz7gNOY5rc=`);
  });

  it("verifies only its own signature", () => {
    const signed = signSessionToken(TOKEN, SECRET);
    expect(verifySessionToken(signed, SECRET)).toBe(TOKEN);
    expect(verifySessionToken(signed, "b".repeat(64))).toBeNull();
    expect(verifySessionToken(`X${signed}`, SECRET)).toBeNull();
    expect(verifySessionToken(`${signed.slice(0, -2)}A=`, SECRET)).toBeNull();
    expect(verifySessionToken(TOKEN, SECRET)).toBeNull();
    expect(verifySessionToken(`.${signed.split(".")[1]}`, SECRET)).toBeNull();
  });
});

describe("authCookieHeader", () => {
  it("passes a signed value through, URL-encoded as a cookie", () => {
    const signed = signSessionToken(TOKEN, SECRET);
    const header = authCookieHeader(signed, SECRET);
    expect(header).toBe(`squint_session=${encodeURIComponent(signed)}`);
    expect(signedValueOf(header)).toBe(signed);
  });

  it("turns a legacy cookie into its stored hash, signed", () => {
    const header = authCookieHeader(LEGACY, SECRET);
    expect(signedValueOf(header)).toBe(signSessionToken(hashSecret(LEGACY), SECRET));
  });

  it("answers null for no cookie, a forged signature or junk, so nothing is looked up", () => {
    for (const value of [
      null,
      undefined,
      "",
      "junk",
      "x".repeat(42),
      signSessionToken(TOKEN, "b".repeat(64)),
      `${TOKEN}.not-a-signature`,
    ]) {
      expect(authCookieHeader(value, SECRET)).toBeNull();
    }
  });
});
