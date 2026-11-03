import { after } from "next/server";
import { authOrigin } from "@/lib/auth/auth-url";
import { crossSiteRefusal, describeError, isCrossSite } from "@/lib/auth/http";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { resetEmailSender } from "@/lib/auth/reset-email";
import { resetRequestSchema } from "@/lib/auth/schemas";
import { clientAddress, createRateLimiter } from "@/lib/capture/rate-limit";
import { database } from "@/lib/db/database";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-IP brake, per instance; each account is also capped at 3 links an hour. */
const limit = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * `POST /api/auth/reset` with `{ email }`: always 202 `{ ok: true }`, whether
 * or not an account has that email. The lookup and the email happen after the
 * response, so its timing doesn't tell either.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const decision = limit(clientAddress(request.headers), Date.now());
  if (!decision.ok) {
    return Response.json(
      { error: "rate-limited" },
      { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
    );
  }
  const body = await readJson(request, resetRequestSchema);
  if (!body.ok) return body.response;
  const db = database();
  if (!db) return json({ error: "not-configured" }, 503);

  const { email } = body.value;
  const options = { now: Date.now(), origin: authOrigin(), send: resetEmailSender() };
  after(async () => {
    try {
      await requestPasswordReset(await db, email, options);
    } catch (error) {
      console.error(`squint auth: reset request failed (${describeError(error)})`);
    }
  });
  return json({ ok: true }, 202);
}
