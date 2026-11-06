import { siteUrl } from "../site-url";

/** Reads AUTH_URL, then what `siteUrl` reads. */
type AuthEnv = Readonly<Record<string, string | undefined>>;

/**
 * The origin links in auth emails point at: `AUTH_URL` when set (production's
 * canonical domain), else the site's own URL (a preview's deployment host,
 * localhost in development). Never the request's Host header, which a caller
 * could set to send someone a link to another site.
 */
export function authOrigin(env: AuthEnv = process.env): URL {
  const configured = env.AUTH_URL?.trim();
  return configured ? new URL(configured) : siteUrl(env);
}
