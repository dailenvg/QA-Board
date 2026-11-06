import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { database } from "../db/database";
import { findMembership, type Membership } from "./memberships";
import { loginHref, PATH_HEADER } from "./next-path";
import { SESSION_COOKIE } from "./session-cookie";
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
