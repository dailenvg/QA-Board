import { after } from "next/server";
import { emailChangeLinkSender } from "@/lib/account/account-email";
import { checkCurrentPassword } from "@/lib/account/current-password";
import { requestEmailChange } from "@/lib/account/email-change";
import { isCurrentEmail } from "@/lib/account/field-rules";
import { emailChangeSchema } from "@/lib/account/schemas";
import { rateLimited, withAccount } from "@/lib/account/with-account";
import { authOrigin } from "@/lib/auth/auth-url";
import { describeError } from "@/lib/auth/http";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST { currentPassword, newEmail }`: mails a confirm link to the new
 * address, sent after the response. Answers 202 `{ ok: true }` whether or not
 * another account has that address (only a free one gets the link). 422
 * `wrong-password` (counted against the sign-in budget) or `same-email`; 429
 * `rate-limited` once that budget is spent, `too-many-requests` past 3
 * requests in an hour.
 */
export const POST = withAccount(async (request, { db, user, ip, now }) => {
  const body = await readJson(request, emailChangeSchema);
  if (!body.ok) return body.response;
  const { currentPassword, newEmail } = body.value;
  if (isCurrentEmail(newEmail, user.email)) return json({ error: "same-email" }, 422);
  const check = await checkCurrentPassword(db, user, currentPassword, ip, now);
  if (!check.ok) {
    return check.reason === "rate-limited"
      ? rateLimited(check.retryAfterSeconds)
      : json({ error: "wrong-password" }, 422);
  }
  const requested = await requestEmailChange(db, user.id, newEmail, {
    now,
    origin: authOrigin(),
    send: emailChangeLinkSender(),
  });
  if (!requested.ok) return json({ error: "too-many-requests" }, 429);
  after(async () => {
    try {
      await requested.deliver();
    } catch (error) {
      console.error(`squint account: email change link failed (${describeError(error)})`);
    }
  });
  return json({ ok: true }, 202);
});
