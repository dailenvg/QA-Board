import { NextResponse } from "next/server";
import { clientAddress } from "../capture/rate-limit";
import { apiAccount } from "../auth/guards";
import { crossSiteRefusal, describeError, isCrossSite } from "../auth/http";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/session-cookie";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { json } from "../share/http";
import { isJsonRequest } from "../workspace/http";

export interface Account {
  db: Database;
  /** The session's user: the only account a handler may act on, whatever the body says. */
  user: SessionUser;
  /** The caller's address, for the sign-in budget. */
  ip: string;
  now: number;
}

type Handler = (request: Request, account: Account) => Promise<Response>;

/**
 * Wraps every `/api/account/…` handler, as `withMember` does the workspace
 * ones. In order: the session (`apiAccount`: a JSON 401 without one); then a
 * same-site `Origin` (403) and a JSON body (415, so a cross-site form can't
 * send one); then the handler, with the session's user. A storage failure
 * answers a JSON 500 and logs only the error's kind and code.
 */
export function withAccount(run: Handler): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const account = await apiAccount(request);
      if (!account.ok) return account.response;
      if (isCrossSite(request)) return crossSiteRefusal();
      if (!isJsonRequest(request)) return json({ error: "unsupported-media-type" }, 415);
      const { db, user } = account;
      return await run(request, { db, user, ip: clientAddress(request.headers), now: Date.now() });
    } catch (error) {
      console.error(`squint account: storage failed (${describeError(error)})`);
      return json({ error: "storage" }, 500);
    }
  };
}

const NO_STORE = { "cache-control": "no-store" };

/** A JSON answer that sets this browser's session cookie to `token`. */
export function withSessionCookie(request: Request, body: unknown, token: string): NextResponse {
  const response = NextResponse.json(body, { headers: NO_STORE });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new URL(request.url)));
  return response;
}

/** A JSON answer that clears this browser's session cookie (its session is already gone). */
export function withoutSessionCookie(request: Request, body: unknown): NextResponse {
  const response = NextResponse.json(body, { headers: NO_STORE });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(new URL(request.url)),
    maxAge: 0,
  });
  return response;
}

/** The sign-in budget ran out: 429 with when to retry. */
export function rateLimited(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate-limited", retryAfterSeconds },
    { status: 429, headers: { ...NO_STORE, "retry-after": String(retryAfterSeconds) } },
  );
}
