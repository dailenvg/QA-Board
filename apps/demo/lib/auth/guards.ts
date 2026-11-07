import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { database, type Database } from "../db/database";
import { findMembership, type Membership } from "./memberships";
import { loginHref, PATH_HEADER } from "./next-path";
import { SESSION_COOKIE, sessionTokenOf } from "./session-cookie";
import { readSession } from "./sessions";
import type { SessionUser } from "./users";

/**
 * Server-side checks for pages, layouts and server actions. Middleware only
 * looks for the cookie; these read the session from Postgres. One lookup per
 * request (React `cache`).
 */

/** The signed-in user, or null (no cookie, unknown or expired session, no database). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = database();
  if (!token || !db) return null;
  return readSession(await db, token, Date.now());
});

/**
 * For route handlers: the signed-in user, or the 401 to answer with. Middleware
 * only checks that a cookie is there; this checks the session behind it.
 */
export async function apiSession(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: Response }
> {
  const user = await getSession();
  if (user) return { ok: true, user };
  return {
    ok: false,
    response: Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "cache-control": "no-store" } },
    ),
  };
}

const NO_STORE = { "cache-control": "no-store" };

const unauthenticated = () =>
  Response.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });

/**
 * For route handlers outside a workspace: the signed-in user, read from
 * `request`'s cookie (no request scope needed), or the JSON 401 to answer with.
 */
export async function apiSignedIn(
  request: Request,
): Promise<{ ok: true; user: SessionUser } | { ok: false; response: Response }> {
  const token = sessionTokenOf(request.headers.get("cookie"));
  const pending = database();
  const db = pending && (await pending);
  const user = token && db ? await readSession(db, token, Date.now()) : null;
  return user ? { ok: true, user } : { ok: false, response: unauthenticated() };
}

export type ApiMember =
  | { ok: true; db: Database; user: SessionUser; membership: Membership }
  | { ok: false; response: Response };

/**
 * For workspace route handlers: the signed-in user's membership of
 * `workspaceId`, and the database it was read from. No session (or no
 * database) is a JSON 401; a workspace the session isn't a member of is a
 * JSON 404, whether or not it exists, admins included. Never a 403, which
 * would say there's something there. The session decides: use the
 * membership's `workspaceId` from here on, not the one in the URL. Reads the
 * cookie from `request`, so it needs no request scope.
 */
export async function apiMember(request: Request, workspaceId: string): Promise<ApiMember> {
  const token = sessionTokenOf(request.headers.get("cookie"));
  const pending = database();
  const db = pending && (await pending);
  const user = token && db ? await readSession(db, token, Date.now()) : null;
  if (!db || !user) return { ok: false, response: unauthenticated() };
  const membership = await findMembership(db, user.id, workspaceId);
  if (!membership) {
    return {
      ok: false,
      response: Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE }),
    };
  }
  return { ok: true, db, user, membership };
}

/** The signed-in user; otherwise redirects to /login, back to the page asked for after. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (user) return user;
  redirect(loginHref((await headers()).get(PATH_HEADER)));
}

/**
 * The signed-in user's membership of `workspaceId`. Anyone else, admins
 * included, gets a 404, as if the workspace didn't exist. Take the id from the
 * route, then use only what this returns.
 */
export async function requireMember(
  workspaceId: string,
): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireSession();
  const db = database();
  const membership = db ? await findMembership(await db, user.id, workspaceId) : null;
  if (!membership) notFound();
  return { user, membership };
}

/** For /admin only: the admin; anyone else signed in gets a 404. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== "admin") notFound();
  return user;
}
