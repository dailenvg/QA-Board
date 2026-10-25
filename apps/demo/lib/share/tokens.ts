import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url: 43 characters. Used for share tokens and owner keys. */
export function createSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored, never the secret itself. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Well-formed secrets only; anything else can be refused before touching storage. */
export function isSecretShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Constant-time check of a presented secret against a stored hash. */
export function secretMatches(secret: string, storedHash: string): boolean {
  const presented = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/** A short random id for a share (not a secret). */
export function createShareId(): string {
  return randomBytes(12).toString("base64url");
}
