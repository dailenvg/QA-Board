import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/auth/form-post";
import { crossSiteRefusal, describeError, isCrossSite } from "@/lib/auth/http";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session-cookie";
import { deleteSession } from "@/lib/auth/sessions";
import { database } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deletes the session behind `token`; a storage failure is logged, not thrown. */
async function deleteStoredSession(token: string): Promise<void> {
  const db = database();
  if (!db) return;
  try {
    await deleteSession(await db, token);
  } catch (error) {
    console.error(`squint auth: sign-out storage failed (${describeError(error)})`);
  }
}

/**
 * `POST /api/auth/logout`: deletes this browser's session, clears the cookie
 * and sends the browser to /login (303, so a plain form post works). The
 * cookie is cleared even if the database can't be reached.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteStoredSession(token);
  const response = seeOther("/login");
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request.nextUrl), maxAge: 0 });
  return response;
}
