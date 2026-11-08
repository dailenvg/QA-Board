import { NextResponse } from "next/server";
import type { EmailChangeFlag } from "../auth/form-flags";
import { isFormPost, readForm, seeOther } from "../auth/form-post";
import { crossSiteRefusal, describeError, guardAuth, isCrossSite } from "../auth/http";
import type { AuthRouteDeps } from "../auth/login-handler";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/session-cookie";
import { EMAIL_CHANGED_HREF } from "../routes";
import { json, readJson } from "../share/http";
import { isSecretShape } from "../share/tokens";
import {
  confirmEmailChange,
  type EmailChangeResult,
  type SendEmailChangedNotice,
} from "./email-change";
import { emailConfirmSchema } from "./schemas";

export interface EmailChangeConfirmDeps extends AuthRouteDeps {
  sendNotice: SendEmailChangedNotice;
  /** Runs work after the response (`after` from next/server). */
  defer: (task: () => Promise<void>) => void;
}

const NO_STORE = { "cache-control": "no-store" };

/** Every session of the user just ended, this browser's included: its cookie goes too. */
function clearCookie<T extends NextResponse>(response: T, request: Request): T {
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(new URL(request.url)),
    maxAge: 0,
  });
  return response;
}

async function confirm(
  token: string,
  { db, now, sendNotice, defer }: EmailChangeConfirmDeps,
): Promise<EmailChangeResult | null> {
  if (!db) return null;
  const result = await confirmEmailChange(await db, token, now);
  if (result.ok) {
    const { oldEmail } = result;
    defer(async () => {
      try {
        await sendNotice(oldEmail);
      } catch (error) {
        console.error(`squint account: email changed notice failed (${describeError(error)})`);
      }
    });
  }
  return result;
}

/** The hydrated page's path: JSON in, JSON out. */
async function fromJson(request: Request, deps: EmailChangeConfirmDeps): Promise<Response> {
  const body = await readJson(request, emailConfirmSchema);
  if (!body.ok) return body.response;
  return guardAuth(async () => {
    const result = await confirm(body.value.token, deps);
    if (!result) return json({ error: "not-configured" }, 503);
    if (result.ok) {
      return clearCookie(NextResponse.json({ ok: true }, { headers: NO_STORE }), request);
    }
    return result.reason === "taken"
      ? json({ error: "taken" }, 409)
      : json({ error: "expired" }, 410);
  });
}

/**
 * A form posted before hydration: a 303 to sign in when the change is made,
 * back to the link's page otherwise (an expired link shows as expired there;
 * a taken address or a failure comes back as a flag).
 */
async function fromForm(request: Request, deps: EmailChangeConfirmDeps): Promise<Response> {
  const token = (await readForm(request)).get("token") ?? "";
  if (!isSecretShape(token)) return seeOther("/login");
  const page = `/email-change/${token}`;
  const back = (flag: EmailChangeFlag) => seeOther(`${page}?error=${flag}`);
  try {
    const result = await confirm(token, deps);
    if (!result) return back("unavailable");
    if (result.ok) return clearCookie(seeOther(EMAIL_CHANGED_HREF), request);
    return result.reason === "taken" ? back("taken") : seeOther(page);
  } catch (error) {
    console.error(`squint auth: storage failed (${describeError(error)})`);
    return back("unavailable");
  }
}

/**
 * `POST /api/auth/email-change/confirm` with `{ token }`: moves the account to
 * the link's address and signs it out everywhere (`confirmEmailChange`), then
 * mails the notice to the old address after the response. No session needed:
 * the link is the proof. JSON answers 410 `expired` for an unknown, used or
 * old link and 409 `taken` when another account got the address first; a form
 * post (before hydration) gets a 303.
 */
export function handleEmailChangeConfirm(
  request: Request,
  deps: EmailChangeConfirmDeps,
): Promise<Response> {
  if (isCrossSite(request)) return Promise.resolve(crossSiteRefusal());
  return isFormPost(request) ? fromForm(request, deps) : fromJson(request, deps);
}
