/**
 * The session cookie's name and options. No Node imports: middleware (edge)
 * reads it too.
 */

export const SESSION_COOKIE = "squint_session";

/** Sessions last 30 days from their last use. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Plain http on this machine (local dev and the e2e server): the only place
 * cookies go without Secure, which would keep them from ever coming back.
 */
export function isLocalHttp(url: URL): boolean {
  return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
}

/**
 * httpOnly, SameSite=Lax, for the whole site, for 30 days. Secure everywhere
 * except plain http on this machine (`isLocalHttp`).
 */
export function sessionCookieOptions(url: URL) {
  return {
    httpOnly: true,
    secure: !isLocalHttp(url),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  } as const;
}

/** The session token in a `Cookie` header, or null. */
export function sessionTokenOf(cookieHeader: string | null): string | null {
  for (const pair of cookieHeader?.split(";") ?? []) {
    const [name, ...value] = pair.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}
