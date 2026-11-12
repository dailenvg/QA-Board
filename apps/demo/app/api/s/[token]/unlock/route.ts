import { NextResponse } from "next/server";
import { clientAddress } from "@/lib/capture/rate-limit";
import { crossSiteRefusal, isCrossSite, LoggableError } from "@/lib/auth/http";
import { database } from "@/lib/db/database";
import { guestPassCookieOptions } from "@/lib/share/guest-pass";
import { json, readJson } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { unlockSchema } from "@/lib/share/schemas";
import { unlockShare } from "@/lib/share/unlock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const NO_STORE = { "cache-control": "no-store" };

/** Only a share in Postgres can have a password, so a protected one always has a database. */
function requireDatabase() {
  const pending = database();
  if (!pending) throw new LoggableError("A protected share without a database");
  return pending;
}

/**
 * `POST { password }`: a guest unlocks a password-protected review link. The
 * right password sets its guest pass (an HttpOnly cookie, 12 hours) and
 * answers `{ passExpiresAt }`; a link without a password answers
 * `{ passExpiresAt: null }` and sets nothing. 401 `wrong-password` (counted);
 * 429 `rate-limited` with `Retry-After` (and `retryAfterSeconds`) after 5
 * wrong passwords for the link, or 30 for any link, from one address in 15
 * minutes; 404 like any unknown link; 403 `cross-site` from another site.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  if (isCrossSite(request)) return crossSiteRefusal();
  return asClient(
    request,
    token,
    "clientUnlock",
    async ({ share }) => {
      const body = await readJson(request, unlockSchema);
      if (!body.ok) return body.response;
      const now = Date.now();
      const attempt = { password: body.value.password, ip: clientAddress(request.headers) };
      const result = await unlockShare(requireDatabase, share, attempt, now);
      if (result.ok) {
        const { pass } = result;
        const response = NextResponse.json(
          { passExpiresAt: pass?.expiresAt ?? null },
          { headers: NO_STORE },
        );
        if (pass) {
          response.cookies.set(
            pass.name,
            pass.value,
            guestPassCookieOptions(new URL(request.url), pass),
          );
        }
        return response;
      }
      if (result.reason === "wrong-password") return json({ error: "wrong-password" }, 401);
      return Response.json(
        { error: "rate-limited", retryAfterSeconds: result.retryAfterSeconds },
        { status: 429, headers: { ...NO_STORE, "retry-after": String(result.retryAfterSeconds) } },
      );
    },
    { gated: false },
  );
}
