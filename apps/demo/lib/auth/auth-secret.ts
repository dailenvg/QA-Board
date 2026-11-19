import { serverKey } from "../share/server-key";
import { LoggableError } from "./http";

/** Reads BETTER_AUTH_SECRET, then AUTH_SECRET, and NODE_ENV. */
type SecretEnv = Readonly<Record<string, string | undefined>>;

/**
 * Stands in for a missing secret outside production builds only (`next dev`,
 * unit tests), as Better Auth's own default does: a session signed with it
 * works on that machine alone. Production refuses to run without a real one.
 */
const DEVELOPMENT_SECRET = "squint-development-only-not-a-secret";

/**
 * The key Better Auth signs session cookies with: derived with HKDF from
 * `BETTER_AUTH_SECRET` when set, else `AUTH_SECRET`, for this purpose only,
 * so a cookie's signature can't stand in for any other use of the secret.
 * Hex, as Better Auth takes a string. Rotating the secret signs everyone out.
 */
export function authSecret(env: SecretEnv = process.env): string {
  const configured = env.BETTER_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim();
  if (!configured && env.NODE_ENV === "production") {
    throw new LoggableError("AUTH_SECRET is not set");
  }
  return serverKey("squint/better-auth/v1", configured || DEVELOPMENT_SECRET).toString("hex");
}
