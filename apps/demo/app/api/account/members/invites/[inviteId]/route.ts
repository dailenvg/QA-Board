import { inviteIdSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json } from "@/lib/share/http";
import { param } from "@/lib/workspace/http";
import { cancelInvite } from "@/lib/workspace/members/cancel-invite";
import { notAllowed } from "@/lib/workspace/members/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ inviteId: string }> };

/**
 * `DELETE`: cancels an invite of the signed-in user's workspace, made by
 * anyone (D2): its link stops working and its seat is free. Answers
 * `{ ok: true }`, also when it was already cancelled. 403 `not-allowed`
 * without the people switch; 404 for an invite the workspace doesn't have (or
 * once it has closed); 409 `accepted` once someone has joined with it.
 */
export function DELETE(request: Request, { params }: Params) {
  return withOwnWorkspace(
    async (_request, { db, user, membership, now }) => {
      const inviteId = param(inviteIdSchema, (await params).inviteId);
      if (!inviteId) return json({ error: "not-found" }, 404);
      const actor = { userId: user.id, workspaceId: membership.workspaceId };
      const outcome = await cancelInvite(db, actor, inviteId, now);
      if (outcome.ok) return json({ ok: true });
      if (outcome.reason === "not-allowed") return notAllowed();
      return json({ error: outcome.reason }, outcome.reason === "accepted" ? 409 : 404);
    },
    { permission: "members.manage" },
  )(request);
}
