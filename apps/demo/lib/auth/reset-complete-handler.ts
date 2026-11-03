import { json, readJson } from "../share/http";
import { isSecretShape } from "../share/tokens";
import { confirmPasswordError, newPasswordError } from "./field-rules";
import type { ResetPasswordFlag } from "./form-flags";
import { readForm, isFormPost, seeOther } from "./form-post";
import { crossSiteRefusal, describeError, guardAuth, isCrossSite } from "./http";
import type { AuthRouteDeps } from "./login-handler";
import { completePasswordReset } from "./password-reset";
import { resetCompleteSchema } from "./schemas";

/** The hydrated form's path: JSON in, JSON out. */
async function fromJson(request: Request, { db, now }: AuthRouteDeps): Promise<Response> {
  const body = await readJson(request, resetCompleteSchema);
  if (!body.ok) return body.response;
  if (!db) return json({ error: "not-configured" }, 503);
  const { token, password } = body.value;
  return guardAuth(async () => {
    const changed = await completePasswordReset(await db, token, password, now);
    return changed ? json({ ok: true }) : json({ error: "expired" }, 410);
  });
}

/**
 * A form posted before hydration: a 303 to /login when the password is set,
 * back to the link's page with an error code when it can't be (an expired
 * link shows as expired there). The token is already that page's path; the
 * passwords never reach a URL.
 */
async function fromForm(request: Request, { db, now }: AuthRouteDeps): Promise<Response> {
  const form = await readForm(request);
  const token = form.get("token") ?? "";
  if (!isSecretShape(token)) return seeOther("/reset");
  const page = `/reset/${token}`;
  const back = (flag: ResetPasswordFlag) => seeOther(`${page}?error=${flag}`);
  const password = form.get("password") ?? "";
  if (newPasswordError(password)) return back("weak");
  if (confirmPasswordError(password, form.get("confirm") ?? "")) return back("mismatch");
  if (!db) return back("unavailable");
  try {
    const changed = await completePasswordReset(await db, token, password, now);
    return seeOther(changed ? "/login?reset=done" : page);
  } catch (error) {
    console.error(`squint auth: storage failed (${describeError(error)})`);
    return back("unavailable");
  }
}

/**
 * `POST /api/auth/reset/complete` with `{ token, password }`: sets the new
 * password and signs the account out everywhere. JSON answers 410 `expired`
 * for an unknown, used or old link and 400 for a password that breaks the
 * rules; a form post (before hydration, with `confirm` too) gets a 303.
 */
export function handleResetComplete(request: Request, deps: AuthRouteDeps): Promise<Response> {
  if (isCrossSite(request)) return Promise.resolve(crossSiteRefusal());
  return isFormPost(request) ? fromForm(request, deps) : fromJson(request, deps);
}
