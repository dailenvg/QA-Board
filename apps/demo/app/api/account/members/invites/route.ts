import { memberInvitesSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json, readJson } from "@/lib/share/http";
import { createInvites } from "@/lib/workspace/members/create-invites";
import { emailLimited, notAllowed, seatsFull } from "@/lib/workspace/members/http";
import { memberInviteEmailSender } from "@/lib/workspace/members/invite-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST { emails }`: invites each address into the signed-in user's
 * workspace (`createInvites`) and emails them, when email is on. Answers 200
 * with each address's result, in order (an invite and whether its email went
 * out, or why that address wasn't invited), and the seats now used. The
 * whole request is refused, writing nothing: 403 `not-allowed` without the
 * people switch (also when it went off a moment ago); 404 once the workspace
 * has closed; 409 `seats-full` with `used` and `limit` when the addresses that
 * pass need more seats than are left; 429 `rate-limited` with
 * `retryAfterSeconds`, `sentInWindow` and `limit` over the day's emails.
 */
export const POST = withOwnWorkspace(
  async (request, { db, user, membership, now }) => {
    const body = await readJson(request, memberInvitesSchema);
    if (!body.ok) return body.response;
    const actor = { userId: user.id, workspaceId: membership.workspaceId };
    const outcome = await createInvites(db, actor, body.value.emails, now, {
      send: memberInviteEmailSender(),
    });
    if (outcome.ok) return json({ results: outcome.results, seats: outcome.seats });
    switch (outcome.reason) {
      case "not-allowed":
        return notAllowed();
      case "not-found":
        return json({ error: "not-found" }, 404);
      case "seats-full":
        return seatsFull(outcome.seats);
      case "rate-limited":
        return emailLimited(outcome);
    }
  },
  { permission: "members.manage" },
);
