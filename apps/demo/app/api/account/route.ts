import { after } from "next/server";
import { scheduleAccountDeletion } from "@/lib/account/account-deletion";
import { deletionNoticeSender } from "@/lib/account/account-email";
import { accountDeletionSchema } from "@/lib/account/schemas";
import { rateLimited, withAccount, withoutSessionCookie } from "@/lib/account/with-account";
import { describeError } from "@/lib/auth/http";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFUSALS = {
  "admin-account": 403,
  "not-found": 404,
  "owner-has-members": 409,
  "confirm-mismatch": 422,
} as const;

/**
 * `DELETE { confirmText, currentPassword }`: deletes the signed-in account
 * (`scheduleAccountDeletion`): it's deleted for good in 30 days, and can be
 * restored until then. Signs out every browser, this one's included, and
 * mails a notice after the response. 403 `admin-account`; 404 without an
 * open workspace; 409 `owner-has-members`; 422 `confirm-mismatch` (costs
 * nothing) or `wrong-password` (counted against the sign-in budget); 429 once
 * that budget is spent.
 */
export const DELETE = withAccount(async (request, { db, user, ip, now }) => {
  const body = await readJson(request, accountDeletionSchema);
  if (!body.ok) return body.response;
  const result = await scheduleAccountDeletion(db, user, { ...body.value, ip }, now);
  if (!result.ok) {
    if (result.reason === "rate-limited") return rateLimited(result.retryAfterSeconds);
    if (result.reason === "wrong-password") return json({ error: "wrong-password" }, 422);
    return json({ error: result.reason }, REFUSALS[result.reason]);
  }
  const { scheduled } = result;
  if (scheduled) {
    const send = deletionNoticeSender();
    after(async () => {
      try {
        await send({
          to: scheduled.email,
          deleteAfter: scheduled.deleteAfter,
          workspaceName: scheduled.workspaceName,
        });
      } catch (error) {
        console.error(`squint account: deletion notice failed (${describeError(error)})`);
      }
    });
  }
  return withoutSessionCookie(request, { ok: true });
});
