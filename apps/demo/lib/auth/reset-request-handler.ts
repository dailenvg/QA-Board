import { clientAddress, createRateLimiter } from "../capture/rate-limit";
import { json, readJson } from "../share/http";
import type { ResetRequestFlag } from "./form-flags";
import { isFormPost, readForm, seeOther } from "./form-post";
import { crossSiteRefusal, describeError, isCrossSite } from "./http";
import type { AuthRouteDeps } from "./login-handler";
import { requestPasswordReset, type SendResetEmail } from "./password-reset";
import { resetRequestSchema } from "./schemas";

export interface ResetRequestDeps extends AuthRouteDeps {
  /** Where reset links point (see `authOrigin`). */
  origin: URL;
  send: SendResetEmail;
  /** Runs work after the response (`after` from next/server). */
  defer: (task: () => Promise<void>) => void;
}

/** Per-IP brake, per instance; each account is also capped at 3 links an hour. */
const limit = createRateLimiter({ limit: 10, windowMs: 60_000 });

type Outcome = { ok: true } | { ok: false; flag: ResetRequestFlag };

/** Looks the email up and sends the link after the response, so its timing tells nothing. */
function schedule(email: string, { db, now, origin, send, defer }: ResetRequestDeps): Outcome {
  if (!db) return { ok: false, flag: "unavailable" };
  defer(async () => {
    try {
      await requestPasswordReset(await db, email, { now, origin, send });
    } catch (error) {
      console.error(`squint auth: reset request failed (${describeError(error)})`);
    }
  });
  return { ok: true };
}

async function fromJson(request: Request, deps: ResetRequestDeps): Promise<Response> {
  const body = await readJson(request, resetRequestSchema);
  if (!body.ok) return body.response;
  const outcome = schedule(body.value.email, deps);
  return outcome.ok ? json({ ok: true }, 202) : json({ error: "not-configured" }, 503);
}

/** A form posted before hydration: a 303 to /reset, `?sent=1` whether or not the account exists. */
async function fromForm(request: Request, deps: ResetRequestDeps): Promise<Response> {
  const parsed = resetRequestSchema.safeParse({ email: (await readForm(request)).get("email") });
  const outcome: Outcome = parsed.success
    ? schedule(parsed.data.email, deps)
    : { ok: false, flag: "invalid-email" };
  return seeOther(outcome.ok ? "/reset?sent=1" : `/reset?error=${outcome.flag}`);
}

/**
 * `POST /api/auth/reset` with `{ email }` (JSON, or form-encoded before
 * hydration). JSON answers 202 `{ ok: true }` whether or not an account has
 * that email; a form post gets a 303 to `/reset?sent=1`. Neither carries the
 * email anywhere.
 */
export function handleResetRequest(request: Request, deps: ResetRequestDeps): Promise<Response> {
  if (isCrossSite(request)) return Promise.resolve(crossSiteRefusal());
  const decision = limit(clientAddress(request.headers), deps.now);
  if (!decision.ok) {
    if (isFormPost(request)) return Promise.resolve(seeOther("/reset?error=rate-limited"));
    return Promise.resolve(
      Response.json(
        { error: "rate-limited" },
        { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
      ),
    );
  }
  return isFormPost(request) ? fromForm(request, deps) : fromJson(request, deps);
}
