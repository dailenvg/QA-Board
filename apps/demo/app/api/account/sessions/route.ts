import { auditAccount } from "@/lib/account/audit";
import { withAccount, withoutSessionCookie } from "@/lib/account/with-account";
import { deleteUserSessions } from "@/lib/auth/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `DELETE` (with a JSON body, `{}`): log out everywhere. Ends every session
 * of the signed-in user, this browser's included, and clears its cookie; the
 * page then goes to /login.
 */
export const DELETE = withAccount(async (request, { db, user, now }) => {
  await db.transaction(async (tx) => {
    await deleteUserSessions(tx, user.id);
    await auditAccount(tx, user.id, "user.signed_out_everywhere", ["sessions"], now);
  });
  return withoutSessionCookie(request, { ok: true });
});
