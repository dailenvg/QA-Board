import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { LoggableError } from "../auth/http";

/**
 * AES-256-GCM for the few secrets the server has to give back later (a review
 * link's token and owner key). The key is derived from `AUTH_SECRET` with
 * HKDF, so there's no extra variable to manage; rotating `AUTH_SECRET` makes
 * sealed values unreadable, which only breaks "copy link" on existing links.
 * `context` is bound in as associated data, so a sealed value only opens for
 * the row and field it was sealed for.
 */

const VERSION = "v1";
const INFO = "squint/sealed-secrets/v1";

function deriveKey(secret: string | undefined): Buffer {
  if (!secret?.trim()) throw new LoggableError("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "squint", INFO, 32));
}

/** `v1.<iv>.<ciphertext>.<tag>`, base64url. */
export function sealSecret(
  plain: string,
  context: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, sealed, cipher.getAuthTag()]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The plain value; throws a `LoggableError` when it was tampered with or sealed for another context. */
export function openSecret(
  sealed: string,
  context: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  const key = deriveKey(secret);
  const parts = sealed.split(".");
  const [iv, data, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
  // Full 12-byte IVs and 16-byte tags only: a truncated tag would be easier to forge.
  if (
    parts.length !== 4 ||
    parts[0] !== VERSION ||
    iv?.length !== 12 ||
    !data ||
    tag?.length !== 16
  ) {
    throw new LoggableError("Unknown sealed format");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    throw new LoggableError("Sealed secret did not open");
  }
}
