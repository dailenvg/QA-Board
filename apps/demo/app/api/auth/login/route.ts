import { NextResponse, type NextRequest } from "next/server";
import { clientAddress } from "@/lib/capture/rate-limit";
import { crossSiteRefusal, guardAuth, isCrossSite } from "@/lib/auth/http";
import { logIn } from "@/lib/auth/login";
import { loginSchema } from "@/lib/auth/schemas";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session-cookie";
import { database } from "@/lib/db/database";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * `POST /api/auth/login` with `{ email, password }`. Sets the session cookie
 * and answers `{ ok: true }`; a wrong password or unknown email answers 401
 * `{ error: "invalid-credentials" }` alike; too many failures answer 429 with
 * `Retry-After`. 503 `{ error: "not-configured" }` without `DATABASE_URL`.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const body = await readJson(request, loginSchema);
  if (!body.ok) return body.response;
  const db = database();
  if (!db) return json({ error: "not-configured" }, 503);
  const attempt = { ...body.value, ip: clientAddress(request.headers) };

  return guardAuth(async () => {
    const result = await logIn(await db, attempt, Date.now());
    if (result.ok) {
      const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
      response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(request.nextUrl));
      return response;
    }
    if (result.reason === "rate-limited") {
      return Response.json(
        { error: "rate-limited", retryAfterSeconds: result.retryAfterSeconds },
        {
          status: 429,
          headers: { ...NO_STORE, "retry-after": String(result.retryAfterSeconds) },
        },
      );
    }
    return json({ error: "invalid-credentials" }, 401);
  });
}
