import { createHmac, timingSafeEqual } from "node:crypto";
import { isLocalHttp } from "../auth/session-cookie";
import { serverKey } from "./server-key";
import type { SharePassword, ShareRecord } from "./types";

/**
 * A guest pass: what a guest of a password-protected review link holds once
 * they've entered its password. An HttpOnly cookie, one per link, valid for
 * 12 hours from when it was issued (it never slides). Its HMAC (keyed from
 * `AUTH_SECRET`) binds the share id, the expiry and the password as stored
 * (its time and Argon2id hash, whose salt is new with every password), so a
 * new password, even the same one again, or removing it voids every pass.
 */

export const GUEST_PASS_TTL_MS = 12 * 60 * 60 * 1000;

const PASS_INFO = "squint/guest-pass/v1";
const COOKIE_PREFIX = "squint_pass_";
/** `<expiresAt>.<HMAC-SHA256, base64url>` */
const PASS_SHAPE = /^(\d{1,16})\.([A-Za-z0-9_-]{43})$/;

type Secret = string | undefined;
type ProtectedShare = Pick<ShareRecord, "id"> & { password: SharePassword };

function mac(text: string, secret: Secret): Buffer {
  return createHmac("sha256", serverKey(PASS_INFO, secret)).update(text, "utf8").digest();
}

/**
 * The pass cookie's name for one share: `squint_pass_` and 22 characters
 * keyed to the share's id, so the name gives away neither its token nor its id.
 */
export function guestPassCookieName(
  shareId: string,
  secret: Secret = process.env.AUTH_SECRET,
): string {
  return COOKIE_PREFIX + mac(`name\n${shareId}`, secret).subarray(0, 16).toString("base64url");
}

function signature(share: ProtectedShare, expiresAt: number, secret: Secret): Buffer {
  const { id, password } = share;
  return mac(["pass", id, expiresAt, password.setAt, password.hash].join("\n"), secret);
}

export interface GuestPass {
  /** The cookie's name (`guestPassCookieName`) and value. */
  name: string;
  value: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** A pass for the share as its password stands now, valid for `GUEST_PASS_TTL_MS`. */
export function issueGuestPass(
  share: ProtectedShare,
  now: number,
  secret: Secret = process.env.AUTH_SECRET,
): GuestPass {
  const expiresAt = now + GUEST_PASS_TTL_MS;
  return {
    name: guestPassCookieName(share.id, secret),
    value: `${expiresAt}.${signature(share, expiresAt, secret).toString("base64url")}`,
    expiresAt,
  };
}

/** Every value of cookie `name` in a `Cookie` header. */
function cookieValues(cookieHeader: string | null, name: string): string[] {
  return (cookieHeader?.split(";") ?? []).flatMap((pair) => {
    const [key, ...value] = pair.trim().split("=");
    return key === name ? [value.join("=")] : [];
  });
}

/** Whether `value` is a pass for the share as it stands, unexpired at `now`. Constant-time. */
function passMatches(value: string, share: ProtectedShare, now: number, secret: Secret): boolean {
  const match = PASS_SHAPE.exec(value);
  if (!match?.[1] || !match[2]) return false;
  const expiresAt = Number(match[1]);
  if (!(expiresAt > now && expiresAt <= now + GUEST_PASS_TTL_MS)) return false;
  const presented = Buffer.from(match[2], "base64url");
  const expected = signature(share, expiresAt, secret);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * THE single entry point for the password gate: whether a guest whose request
 * carries `cookieHeader` may see `share`. True for a link without a password;
 * for a protected one, only with a pass issued for its current password,
 * unexpired at `now`. Every guest surface asks this (`asClient`, the shared
 * page through `openGuestShare`), and so must anything new that serves a
 * share to guests, such as the /px/s/[token] proxy. Fails closed: without
 * `AUTH_SECRET` no pass is valid.
 */
export function verifyGuestPass(
  cookieHeader: string | null,
  share: Pick<ShareRecord, "id" | "password">,
  now: number = Date.now(),
  secret: Secret = process.env.AUTH_SECRET,
): boolean {
  const { id, password } = share;
  if (!password) return true;
  let name: string;
  try {
    name = guestPassCookieName(id, secret);
  } catch {
    return false;
  }
  return cookieValues(cookieHeader, name).some((value) =>
    passMatches(value, { id, password }, now, secret),
  );
}

/**
 * HttpOnly, SameSite=Lax, for the whole site (the page, its API and, later,
 * the proxy), until the pass expires. Secure except on local plain http.
 */
export function guestPassCookieOptions(url: URL, pass: GuestPass) {
  return {
    httpOnly: true,
    secure: !isLocalHttp(url),
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_PASS_TTL_MS / 1000,
    expires: new Date(pass.expiresAt),
  } as const;
}
