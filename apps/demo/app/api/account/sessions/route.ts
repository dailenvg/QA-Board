import { logOutEverywhere } from "@/lib/account/log-out-everywhere";
import { withAccount, withoutSessionCookie } from "@/lib/account/with-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `DELETE` (with a JSON body, `{}`): log out everywhere (`logOutEverywhere`).
 * Ends every session of the signed-in user, this browser's included, voids
 * their pending email changes, and clears this browser's cookie; the page
 * then goes to /login.
 */
export const DELETE = withAccount(async (request, { db, user, now }) => {
  await logOutEverywhere(db, user.id, now);
  return withoutSessionCookie(request, { ok: true });
});
