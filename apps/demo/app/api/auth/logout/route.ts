import type { NextRequest } from "next/server";
import { auditAccount } from "@/lib/account/audit";
import { authSecret } from "@/lib/auth/auth-secret";
import { endSession } from "@/lib/auth/better-auth";
import { isFormPost, readForm, seeOther } from "@/lib/auth/form-post";
import { crossSiteRefusal, describeError, isCrossSite } from "@/lib/auth/http";
import { safeNextPath } from "@/lib/auth/next-path";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session-cookie";
import { authCookieHeader } from "@/lib/auth/session-token";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ends the session behind the cookie's `value` and writes the sign-out to the
 * audit log; a failure (storage, no secret) is logged, not thrown. A value
 * that can't be a session never reaches the database.
 */
async function endStoredSession(value: string): Promise<void> {
  try {
    const cookie = authCookieHeader(value, authSecret());
    const pending = cookie ? database() : null;
    if (!cookie || !pending) return;
    const db = await pending;
    const user = await endSession(db, cookie);
    if (user) await auditAccount(db, user.id, "user.signed_out", [], Date.now());
  } catch (error) {
    console.error(`squint auth: sign-out storage failed (${describeError(error)})`);
  }
}

/** Where to go once signed out: a form's `next` path on this site (an invite's page), else /login. */
async function afterSignOut(request: NextRequest): Promise<string> {
  if (!isFormPost(request)) return "/login";
  const next = safeNextPath((await readForm(request)).get("next"));
  return next === "/" ? "/login" : next;
}

/**
 * `POST /api/auth/logout`: deletes this browser's session, clears the cookie
 * and sends the browser to /login, or to the form's `next` path (an invite's
 * page, to continue as someone else), with a 303 so a plain form post works.
 * The cookie is cleared even if the database can't be reached.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  if (value) await endStoredSession(value);
  const response = seeOther(await afterSignOut(request));
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request.nextUrl), maxAge: 0 });
  return response;
}
