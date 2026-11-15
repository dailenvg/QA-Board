import { memberIdSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json } from "@/lib/share/http";
import { param } from "@/lib/workspace/http";
import { notAllowed } from "@/lib/workspace/members/http";
import { removeMember } from "@/lib/workspace/members/remove-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

/**
 * `DELETE` (with a JSON body, `{}`): removes a member from the signed-in
 * user's workspace (`removeMember`): signed out at once, their account
 * deleted after 24 hours. Answers `{ ok: true }`. 403 `owner-only` for the
 * owner; 403 `not-allowed` without the people switch, and with `protected:
 * true` too for themself and for another member with it unless the owner
 * asks (D1); 404 for someone not in
 * the workspace (already removed); 409 `leaving` once they deleted their own
 * account.
 */
export function DELETE(request: Request, { params }: Params) {
  return withOwnWorkspace(
    async (_request, { db, user, membership, now }) => {
      const userId = param(memberIdSchema, (await params).userId);
      if (!userId) return json({ error: "not-found" }, 404);
      const actor = { userId: user.id, workspaceId: membership.workspaceId };
      const outcome = await removeMember(db, actor, userId, now);
      if (outcome.ok) return json({ ok: true });
      switch (outcome.reason) {
        case "not-allowed":
          return notAllowed();
        case "protected":
          return json({ error: "not-allowed", permission: "members.manage", protected: true }, 403);
        case "owner-only":
          return json({ error: "owner-only" }, 403);
        case "not-found":
          return json({ error: "not-found" }, 404);
        case "leaving":
          return json({ error: "leaving" }, 409);
      }
    },
    { permission: "members.manage" },
  )(request);
}
