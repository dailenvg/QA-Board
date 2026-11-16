import { createHmac, timingSafeEqual } from "node:crypto";
import { serverKey } from "./server-key";

/**
 * A team member on one review link (4.11), without their id: a key and an
 * avatar version of that link's own, HMACs keyed from `AUTH_SECRET`. The
 * same person, and the same photo, read differently on every link, so two
 * clients can't match someone across their links. Rotating `AUTH_SECRET`
 * changes them all, so avatars just load again.
 */

const KEY_LENGTH = 22;
const VERSION_LENGTH = 16;

/** What a key on a link looks like: base64url, `KEY_LENGTH` long. */
export const SHARE_PERSON_KEY = /^[A-Za-z0-9_-]{22}$/;

function hmac(info: string, message: string, secret: string | undefined, length: number) {
  return createHmac("sha256", serverKey(info, secret))
    .update(message)
    .digest("base64url")
    .slice(0, length);
}

/** The member's key on the link `shareId`. */
export function sharePersonKey(
  shareId: string,
  userId: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  return hmac("squint/share-person/v1", `${shareId}:${userId}`, secret, KEY_LENGTH);
}

/**
 * Their avatar's `?v=` on the link `shareId`: changes with the photo (its
 * stored key), and never repeats on another link, as `logoVersion` would.
 */
export function shareAvatarVersion(
  shareId: string,
  avatarKey: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  return hmac("squint/share-avatar-version/v1", `${shareId}:${avatarKey}`, secret, VERSION_LENGTH);
}

/** Whether a key a guest sent is `candidate`, in constant time. */
export function sameShareKey(key: string, candidate: string): boolean {
  return (
    SHARE_PERSON_KEY.test(key) &&
    key.length === candidate.length &&
    timingSafeEqual(Buffer.from(key), Buffer.from(candidate))
  );
}
