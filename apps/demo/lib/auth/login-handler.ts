import { NextResponse, type NextRequest } from "next/server";
import { clientAddress } from "../capture/rate-limit";
import type { Database } from "../db/database";
import { json, readJson } from "../share/http";
import type { LoginError } from "./auth-client";
import { isFormPost, readForm, seeOther } from "./form-post";
import { crossSiteRefusal, describeError, isCrossSite } from "./http";
import { logIn, type LoginResult } from "./login";
import { loginHref, safeNextPath, withParams, withWelcome } from "./next-path";
import { loginSchema } from "./schemas";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

export interface AuthRouteDeps {
  /** The database, or null without `DATABASE_URL`. */
  db: Promise<Database> | null;
  now: number;
}

type Attempt = LoginResult | { ok: false; reason: "not-configured" | "storage" };

const NO_STORE = { "cache-control": "no-store" };

async function attempt(
  request: NextRequest,
  credentials: { email: string; password: string },
  { db, now }: AuthRouteDeps,
): Promise<Attempt> {
  if (!db) return { ok: false, reason: "not-configured" };
  try {
    return await logIn(await db, { ...credentials, ip: clientAddress(request.headers) }, now);
  } catch (error) {
    console.error(`squint auth: storage failed (${describeError(error)})`);
    return { ok: false, reason: "storage" };
  }
}

function withSession<T extends NextResponse>(response: T, request: NextRequest, token: string): T {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request.nextUrl));
  return response;
}

/** The hydrated form's path: JSON in, JSON out. */
async function fromJson(request: NextRequest, deps: AuthRouteDeps): Promise<Response> {
  const body = await readJson(request, loginSchema);
  if (!body.ok) return body.response;
  const result = await attempt(request, body.value, deps);
  if (result.ok) {
    return withSession(
      NextResponse.json({ ok: true }, { headers: NO_STORE }),
      request,
      result.token,
    );
  }
  switch (result.reason) {
    case "rate-limited":
      return Response.json(
        { error: "rate-limited", retryAfterSeconds: result.retryAfterSeconds },
        { status: 429, headers: { ...NO_STORE, "retry-after": String(result.retryAfterSeconds) } },
      );
    case "invalid":
      return json({ error: "invalid-credentials" }, 401);
    case "not-configured":
      return json({ error: "not-configured" }, 503);
    case "storage":
      return json({ error: "storage" }, 500);
  }
}

/**
 * A form posted before the page hydrated: always a 303. Signed in, on to
 * `next`; otherwise back to /login with an error code (and the lock's seconds),
 * never the email or password.
 */
async function fromForm(request: NextRequest, deps: AuthRouteDeps): Promise<Response> {
  const form = await readForm(request);
  const next = safeNextPath(form.get("next"));
  const back = (error: LoginError, retryAfterSeconds?: number) =>
    seeOther(
      withParams(loginHref(next), {
        error,
        ...(retryAfterSeconds ? { retry: String(retryAfterSeconds) } : {}),
      }),
    );
  const parsed = loginSchema.safeParse({
    email: form.get("email") ?? "",
    password: form.get("password") ?? "",
  });
  if (!parsed.success) return back("invalid-credentials");
  const result = await attempt(request, parsed.data, deps);
  if (result.ok) return withSession(seeOther(withWelcome(next)), request, result.token);
  switch (result.reason) {
    case "rate-limited":
      return back("rate-limited", result.retryAfterSeconds);
    case "invalid":
      return back("invalid-credentials");
    case "not-configured":
      return back("not-configured");
    case "storage":
      return back("failed");
  }
}

/**
 * `POST /api/auth/login`. JSON `{ email, password }` from the hydrated form:
 * sets the session cookie and answers `{ ok: true }`; 401
 * `invalid-credentials` for a wrong password and an unknown email alike; 429
 * with `Retry-After` once rate-limited; 503 without a database. A form-encoded
 * post (before hydration) gets the same checks, answered with a 303.
 * Cross-site posts are refused either way.
 */
export function handleLogin(request: NextRequest, deps: AuthRouteDeps): Promise<Response> {
  if (isCrossSite(request)) return Promise.resolve(crossSiteRefusal());
  return isFormPost(request) ? fromForm(request, deps) : fromJson(request, deps);
}
