import { crossSiteRefusal, guardAuth, isCrossSite } from "@/lib/auth/http";
import { completePasswordReset } from "@/lib/auth/password-reset";
import { resetCompleteSchema } from "@/lib/auth/schemas";
import { database } from "@/lib/db/database";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/auth/reset/complete` with `{ token, password }`: sets the new
 * password and signs the account out everywhere. 410 `{ error: "expired" }`
 * when the link is unknown, used or past its hour; 400 for a password that
 * breaks the rules (the form checks first).
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const body = await readJson(request, resetCompleteSchema);
  if (!body.ok) return body.response;
  const db = database();
  if (!db) return json({ error: "not-configured" }, 503);
  const { token, password } = body.value;

  return guardAuth(async () => {
    const changed = await completePasswordReset(await db, token, password, Date.now());
    return changed ? json({ ok: true }) : json({ error: "expired" }, 410);
  });
}
