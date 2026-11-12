import { hkdfSync } from "node:crypto";
import { LoggableError } from "../auth/http";

/**
 * A 32-byte key for one purpose (`info`), derived from `AUTH_SECRET` with
 * HKDF, as `sealed-secrets.ts` derives its own: no extra variable to manage,
 * and each purpose's key is unrelated to the others. Rotating `AUTH_SECRET`
 * changes every key derived from it.
 */
export function serverKey(info: string, secret: string | undefined = process.env.AUTH_SECRET) {
  if (!secret?.trim()) throw new LoggableError("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "squint", info, 32));
}
