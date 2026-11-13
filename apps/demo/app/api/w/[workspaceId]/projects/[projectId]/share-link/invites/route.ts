import { prepareInvitees } from "@/lib/share/invite-addresses";
import { inviteEmailSender } from "@/lib/share/invite-email";
import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { idSchema, shareInvitesSchema } from "@/lib/workspace/schemas";
import { sendInvites, type InviteOutcome } from "@/lib/workspace/share-invites";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** How each refusal answers, and what it carries for the Share window to explain. */
function refused(outcome: Exclude<InviteOutcome, { ok: true }>): Response {
  switch (outcome.reason) {
    case "not-found":
      return notFound();
    case "link-closed":
    case "review-closed":
      return json({ error: outcome.reason }, 409);
    case "members-only":
      return json({ error: outcome.reason, addresses: outcome.addresses }, 403);
    case "rate-limited":
      return Response.json(
        { error: outcome.reason, retryAfterSeconds: outcome.retryAfterSeconds },
        {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(outcome.retryAfterSeconds),
          },
        },
      );
    case "send-failed":
      return json({ error: outcome.reason }, 502);
  }
}

/**
 * `POST { addresses }`: emails the project's review link to up to 10
 * addresses (trimmed, lowercased, deduped), one email each, from the
 * workspace's sender. Answers `{ sent, invitedCount }`: how many went, and
 * how many different people the link's invitations have reached. 400
 * `invalid-addresses` (with `addresses`) when any entry isn't an address;
 * 404 without a link; 409 `link-closed` (project archived) or
 * `review-closed`; 403 `members-only` (with `addresses`) on a preview, for
 * anyone outside the workspace; 429 `rate-limited` with `Retry-After` (30 per
 * workspace and 20 per member an hour); 502 `send-failed`. Keeps no list of
 * who was invited: the audit log holds HMACs of the addresses only.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, shareInvitesSchema);
  if (!body.ok) return body.response;
  const { addresses, invalid } = prepareInvitees(body.value.addresses);
  if (invalid.length || addresses.length === 0) {
    return json({ error: "invalid-addresses", addresses: invalid }, 400);
  }
  const actor = { userId: user.id, workspaceId };
  const outcome = await sendInvites(db, actor, projectId, addresses, now, {
    send: inviteEmailSender(),
  });
  return outcome.ok
    ? json({ sent: outcome.sent, invitedCount: outcome.invitedCount })
    : refused(outcome);
});
