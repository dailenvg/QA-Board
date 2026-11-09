import { NextResponse } from "next/server";
import { clientAddress } from "../capture/rate-limit";
import { apiAccount } from "../auth/guards";
import { crossSiteRefusal, describeError, isCrossSite } from "../auth/http";
import { findOwnWorkspace, type Membership } from "../auth/memberships";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/session-cookie";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { json } from "../share/http";
import { isBytesRequest, isJsonRequest } from "../workspace/http";

export interface Account {
  db: Database;
  /** The session's user: the only account a handler may act on, whatever the body says. */
  user: SessionUser;
  /** The caller's address, for the sign-in budget. */
  ip: string;
  now: number;
}

type Handler = (request: Request, account: Account) => Promise<Response>;

/** What a write's body must be: JSON (most), or raw image bytes (an avatar or logo upload). */
type Body = "json" | "bytes";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A write from another site, or with a body type a plain form could send: refused before any work. */
function refuseWrite(request: Request, body: Body): Response | null {
  if (!WRITES.has(request.method)) return null;
  if (isCrossSite(request)) return crossSiteRefusal();
  const typed = body === "json" ? isJsonRequest(request) : isBytesRequest(request);
  return typed ? null : json({ error: "unsupported-media-type" }, 415);
}

/**
 * Wraps every `/api/account/…` handler, as `withMember` does the workspace
 * ones. In order: the session (`apiAccount`: a JSON 401 without one); then,
 * on writes, a same-site `Origin` (403) and a JSON (or image) body (415, so a
 * cross-site form can't send one); then the handler, with the session's user.
 * A storage failure answers a JSON 500 and logs only the error's kind and code.
 */
export function withAccount(
  run: Handler,
  options: { body?: Body } = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const account = await apiAccount(request);
      if (!account.ok) return account.response;
      const refused = refuseWrite(request, options.body ?? "json");
      if (refused) return refused;
      const { db, user } = account;
      return await run(request, { db, user, ip: clientAddress(request.headers), now: Date.now() });
    } catch (error) {
      console.error(`squint account: storage failed (${describeError(error)})`);
      return json({ error: "storage" }, 500);
    }
  };
}

export interface WorkspaceAccount extends Account {
  /** The workspace the session's user belongs to: the only workspace a handler may act on. */
  membership: Membership;
}

type WorkspaceHandler = (request: Request, account: WorkspaceAccount) => Promise<Response>;

/**
 * Wraps the `/api/account/workspace…` handlers: `withAccount`, then the
 * workspace the session's user belongs to (`findOwnWorkspace`; a JSON 404
 * without one, as for the admin). With `owner` (every write), a member who
 * doesn't own it gets a 403 `owner-only`. The workspace comes from the
 * membership alone: no route takes a workspace id.
 */
export function withOwnWorkspace(
  run: WorkspaceHandler,
  options: { body?: Body; owner?: boolean } = {},
): (request: Request) => Promise<Response> {
  return withAccount(async (request, account) => {
    const membership = await findOwnWorkspace(account.db, account.user.id);
    if (!membership) return json({ error: "not-found" }, 404);
    if (options.owner && membership.role !== "owner") return json({ error: "owner-only" }, 403);
    return run(request, { ...account, membership });
  }, options);
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
