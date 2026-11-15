import { inviteIdSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json } from "@/lib/share/http";
import { param } from "@/lib/workspace/http";
import { emailLimited, notAllowed, seatsFull, tooSoon } from "@/lib/workspace/members/http";
import { memberInviteEmailSender } from "@/lib/workspace/members/invite-email";
import { resendInvite } from "@/lib/workspace/members/resend-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ inviteId: string }> };

/**
 * `POST`: sends an open invite of the signed-in user's workspace again, made
 * by anyone (D2): the same link, working for 7 days from now, emailed when
 * email is on (`resendInvite`). Answers `{ emailed, expiresAt }` (epoch ms).
 * 403 `not-allowed` without the people switch; 404 for an invite that isn't
 * open (used, cancelled, unknown) or once the workspace has closed; 409
 * `seats-full` renewing an expired one without a seat; 429 `cooldown` within a
 * minute of its last email, or `rate-limited` over the day's emails.
 */
export function POST(request: Request, { params }: Params) {
  return withOwnWorkspace(
    async (_request, { db, user, membership, now }) => {
      const inviteId = param(inviteIdSchema, (await params).inviteId);
      if (!inviteId) return json({ error: "not-found" }, 404);
      const actor = { userId: user.id, workspaceId: membership.workspaceId };
      const outcome = await resendInvite(db, actor, inviteId, now, {
        send: memberInviteEmailSender(),
      });
      if (outcome.ok) return json({ emailed: outcome.emailed, expiresAt: outcome.expiresAt });
      switch (outcome.reason) {
        case "not-allowed":
          return notAllowed();
        case "not-found":
          return json({ error: "not-found" }, 404);
        case "cooldown":
          return tooSoon(outcome.retryAfterSeconds);
        case "seats-full":
          return seatsFull(outcome.seats);
        case "rate-limited":
          return emailLimited(outcome);
      }
    },
    { permission: "members.manage" },
  )(request);
}
