import { describe, expect, it } from "vitest";
import {
  GUEST_PASS_TTL_MS,
  guestPassCookieName,
  guestPassCookieOptions,
  issueGuestPass,
  verifyGuestPass,
} from "./guest-pass";
import type { ShareRecord } from "./types";

const SECRET = "test-auth-secret-0123456789abcdef";
const NOW = Date.UTC(2026, 10, 12, 9);
const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g";
const SHARE = { id: "share-1", password: { hash: HASH, setAt: NOW - 1000 } };

/** The `Cookie` header a browser holding `pass` sends, with other cookies around it. */
function cookieOf(pass: { name: string; value: string }): string {
  return `squint_session=abc; ${pass.name}=${pass.value}; squint_reviewer_name=Cleo`;
}

const verify = (
  cookie: string | null,
  share: Pick<ShareRecord, "id" | "password"> = SHARE,
  now = NOW + 1,
  secret = SECRET,
) => verifyGuestPass(cookie, share, now, secret);

describe("a guest pass", () => {
  it("opens its share until 12 hours after it was issued, and not a moment longer", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    expect(pass.expiresAt).toBe(NOW + GUEST_PASS_TTL_MS);
    expect(GUEST_PASS_TTL_MS).toBe(12 * 60 * 60 * 1000);
    expect(verify(cookieOf(pass))).toBe(true);
    expect(verify(cookieOf(pass), SHARE, pass.expiresAt - 1)).toBe(true);
    expect(verify(cookieOf(pass), SHARE, pass.expiresAt)).toBe(false);
  });

  it("is refused once tampered with: its signature, its expiry or its name", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    const [expiry, signature = ""] = pass.value.split(".");
    const flipped = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    expect(verify(cookieOf({ ...pass, value: `${expiry}.${flipped}` }))).toBe(false);
    expect(verify(cookieOf({ ...pass, value: `${Number(expiry) + 1000}.${signature}` }))).toBe(
      false,
    );
    expect(verify(cookieOf({ ...pass, value: `${expiry}.${signature}x` }))).toBe(false);
    expect(verify(cookieOf({ ...pass, value: "" }))).toBe(false);
    expect(verify(cookieOf({ ...pass, name: "squint_pass_other" }))).toBe(false);
  });

  it("opens only the share it was issued for", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    const other = { ...SHARE, id: "share-2" };
    expect(verify(cookieOf(pass), other)).toBe(false);
    // Even under the other share's cookie name.
    const renamed = { ...pass, name: guestPassCookieName(other.id, SECRET) };
    expect(verify(cookieOf(renamed), other)).toBe(false);
    expect(guestPassCookieName(other.id, SECRET)).not.toBe(pass.name);
  });

  it("stops working when the password changes, even to the same one again", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    // The same password hashed again has a new salt, and is set at a new time.
    const sameAgain = { ...SHARE, password: { hash: `${HASH}x`, setAt: SHARE.password.setAt } };
    expect(verify(cookieOf(pass), sameAgain)).toBe(false);
    const later = { ...SHARE, password: { hash: HASH, setAt: NOW + 5 } };
    expect(verify(cookieOf(pass), later)).toBe(false);
  });

  it("isn't needed on a link without a password, and is the only way past one with it", () => {
    expect(verify(null, { id: "share-1", password: null })).toBe(true);
    expect(verify("squint_session=abc", { id: "share-1", password: null })).toBe(true);
    expect(verify(null)).toBe(false);
    expect(verify("squint_session=abc")).toBe(false);
  });

  it("is signed with AUTH_SECRET: another secret, or none at all, opens nothing", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    expect(verify(cookieOf(pass), SHARE, NOW + 1, "another-secret-0123456789abcdef")).toBe(false);
    expect(verify(cookieOf(pass), SHARE, NOW + 1, "")).toBe(false);
    expect(() => issueGuestPass(SHARE, NOW, undefined)).toThrow("AUTH_SECRET is not set");
  });

  it("takes any of several values under its name, so a stale copy doesn't hide a fresh one", () => {
    const stale = issueGuestPass(SHARE, NOW - GUEST_PASS_TTL_MS, SECRET);
    const fresh = issueGuestPass(SHARE, NOW, SECRET);
    expect(verify(`${cookieOf(stale)}; ${fresh.name}=${fresh.value}`)).toBe(true);
    expect(verify(cookieOf(stale))).toBe(false);
  });

  it("is named for its share without naming the share's id", () => {
    const name = guestPassCookieName("share-1", SECRET);
    expect(name).toMatch(/^squint_pass_[A-Za-z0-9_-]{22}$/);
    expect(name).not.toContain("share-1");
    expect(guestPassCookieName("share-1", SECRET)).toBe(name);
    expect(guestPassCookieName("share-1", "another-secret-0123456789abcdef")).not.toBe(name);
  });

  it("travels in an HttpOnly, SameSite=Lax cookie for the whole site, Secure off local http", () => {
    const pass = issueGuestPass(SHARE, NOW, SECRET);
    const options = guestPassCookieOptions(new URL("https://squint.test/api/s/t/unlock"), pass);
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
      expires: new Date(pass.expiresAt),
    });
    const local = guestPassCookieOptions(new URL("http://127.0.0.1:3100/api/s/t/unlock"), pass);
    expect(local.secure).toBe(false);
    const plain = guestPassCookieOptions(new URL("http://squint.test/api/s/t/unlock"), pass);
    expect(plain.secure).toBe(true);
  });
});
