import { NextResponse } from "next/server";
import { json, rateLimit, readJson, validate } from "../share/http";
import { isSecretShape } from "../share/tokens";
import {
  acceptInvite,
  type AcceptRefusal,
  type AcceptServices,
  type Joiner,
} from "../workspace/members/accept";
import { confirmPasswordError } from "./field-rules";
import type { JoinFlag } from "./form-flags";
import { isFormPost, readForm, seeOther } from "./form-post";
import { apiAccount } from "./guards";
import { crossSiteRefusal, describeError, isCrossSite } from "./http";
import type { AuthRouteDeps } from "./login-handler";
import { JOINED_PATH } from "./next-path";
import { joinAccountSchema, joinSchema } from "./schemas";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

export interface JoinDeps extends AuthRouteDeps {
  services: AcceptServices;
}

const NO_STORE = { "cache-control": "no-store" };

const STATUS: Record<AcceptRefusal, number> = {
  "not-found": 404,
  expired: 409,
  cancelled: 409,
  used: 409,
  "seats-full": 409,
  "in-another-workspace": 409,
  "sign-in-first": 409,
  "account-closing": 409,
  "wrong-account": 403,
  "cannot-join": 403,
};

type Attempt =
  Awaited<ReturnType<typeof acceptInvite>> | { ok: false; reason: "not-configured" | "storage" };

/** The session behind the request's cookie, if any: when there is one, it decides. */
async function sessionJoiner(request: Request): Promise<Joiner | null> {
  const account = await apiAccount(request);
  return account.ok ? { session: account.user } : null;
}

async function attempt(
  token: string,
  joiner: Joiner,
  { db, now, services }: JoinDeps,
): Promise<Attempt> {
  if (!db) return { ok: false, reason: "not-configured" };
  try {
    return await acceptInvite(await db, token, joiner, now, services);
  } catch (error) {
    console.error(`squint auth: storage failed (${describeError(error)})`);
    return { ok: false, reason: "storage" };
  }
}

function withSession<T extends NextResponse>(response: T, request: Request, token: string | null) {
  if (token)
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new URL(request.url)));
  return response;
}

/** The hydrated page's path: JSON in, JSON out. */
async function fromJson(request: Request, deps: JoinDeps): Promise<Response> {
  const body = await readJson(request, joinSchema);
  if (!body.ok) return body.response;
  const { token, name = "", password = "" } = body.value;
  let joiner = await sessionJoiner(request);
  if (!joiner) {
    const account = validate(joinAccountSchema, { name, password });
    if (!account.ok) return account.response;
    joiner = { account: account.value };
  }
  const result = await attempt(token, joiner, deps);
  if (result.ok) {
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    return withSession(response, request, result.sessionToken);
  }
  if (result.reason === "not-configured") return json({ error: "not-configured" }, 503);
  if (result.reason === "storage") return json({ error: "storage" }, 500);
  return json({ error: result.reason }, STATUS[result.reason]);
}

/**
 * A form posted before the page hydrated: always a 303. Joined, on to the
 * Overview with the welcome flag; otherwise back to the invite's page with a code (never the name
 * or password). An unusable token goes to /login.
 */
async function fromForm(request: Request, deps: JoinDeps): Promise<Response> {
  const form = await readForm(request);
  const token = form.get("token") ?? "";
  if (!isSecretShape(token)) return seeOther("/login");
  const back = (flag: JoinFlag) => seeOther(`/join/${token}?error=${flag}`);
  if (rateLimit(request, "join")) return back("rate-limited");
  let joiner = await sessionJoiner(request);
  if (!joiner) {
    const password = form.get("password") ?? "";
    const account = joinAccountSchema.safeParse({ name: form.get("name") ?? "", password });
    if (!account.success) return back("invalid");
    if (confirmPasswordError(password, form.get("confirm") ?? "")) return back("mismatch");
    joiner = { account: account.data };
  }
  const result = await attempt(token, joiner, deps);
  if (result.ok) return withSession(seeOther(JOINED_PATH), request, result.sessionToken);
  if (result.reason === "not-configured" || result.reason === "storage") {
    return back("unavailable");
  }
  return back(result.reason);
}

/**
 * `POST /api/auth/join`: accepts a workspace invite (`acceptInvite`). JSON
 * `{ token }` from a signed-in browser, whose session always decides (a name
 * and password in the body are ignored then), or `{ token, name, password }`
 * without one, which signs the new member in. Answers `{ ok: true }`; 400 for
 * a body that breaks the rules (a token alone without a session included);
 * 403 `wrong-account` or `cannot-join`; 404 `not-found` (unknown link, or a
 * closed workspace); 409 `expired`, `cancelled`, `used`, `seats-full`,
 * `in-another-workspace`, `sign-in-first` or `account-closing`; 429 over the
 * `join` limit. A form post (before hydration) gets a 303. Cross-site posts
 * are refused first, then the limit.
 */
export async function handleJoin(request: Request, deps: JoinDeps): Promise<Response> {
  if (isCrossSite(request)) return crossSiteRefusal();
  if (isFormPost(request)) return fromForm(request, deps);
  return rateLimit(request, "join") ?? fromJson(request, deps);
}
