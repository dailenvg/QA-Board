import { changePassword } from "@/lib/account/password-change";
import { passwordChangeSchema } from "@/lib/account/schemas";
import { rateLimited, withAccount, withSessionCookie } from "@/lib/account/with-account";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST { currentPassword, newPassword }`: changes the signed-in user's
 * password. Signs out every other browser and gives this one a new session
 * cookie. 422 `wrong-password` (which counts against the sign-in budget), 429
 * once that budget is spent, 400 for a new password that breaks the rules.
 */
export const POST = withAccount(async (request, { db, user, ip, now }) => {
  const body = await readJson(request, passwordChangeSchema);
  if (!body.ok) return body.response;
  const result = await changePassword(db, user, { ...body.value, ip }, now);
  if (result.ok) return withSessionCookie(request, { ok: true }, result.token);
  if (result.reason === "rate-limited") return rateLimited(result.retryAfterSeconds);
  return json({ error: "wrong-password" }, 422);
});
