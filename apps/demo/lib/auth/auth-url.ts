import { siteUrl } from "../site-url";

/** Reads BETTER_AUTH_URL, then AUTH_URL, then what `siteUrl` reads. */
type AuthEnv = Readonly<Record<string, string | undefined>>;

/**
 * Squint's own origin for auth: where links in auth emails point, and Better
 * Auth's `baseURL`. `BETTER_AUTH_URL` when set (an override), else `AUTH_URL`
 * (production's canonical domain), else the site's own URL (a preview's
 * deployment host, localhost in development). Never the request's Host
 * header, which a caller could set to send someone a link to another site.
 */
export function authOrigin(env: AuthEnv = process.env): URL {
  const configured = env.BETTER_AUTH_URL?.trim() || env.AUTH_URL?.trim();
  return configured ? new URL(configured) : siteUrl(env);
}
