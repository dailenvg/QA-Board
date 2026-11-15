import { memberIdSchema, memberSwitchesSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { json, readJson } from "@/lib/share/http";
import { param } from "@/lib/workspace/http";
import { setMemberSwitches } from "@/lib/workspace/members/set-switches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

/**
 * `PATCH { reviewLinks, trash, import, people }`: the owner sets all four of
 * a member's switches (`setMemberSwitches`); they bind the member's next
 * request. Answers `{ permissions }`, the switches now on. 403 `owner-only`
 * for anyone but the owner; 404 for someone not in the workspace; 409
 * `owner` for the owner's own row, `leaving` once they deleted their account.
 */
export function PATCH(request: Request, { params }: Params) {
  return withOwnWorkspace(
    async (_request, { db, user, membership, now }) => {
      const userId = param(memberIdSchema, (await params).userId);
      if (!userId) return json({ error: "not-found" }, 404);
      const body = await readJson(request, memberSwitchesSchema);
      if (!body.ok) return body.response;
      const actor = { userId: user.id, workspaceId: membership.workspaceId };
      const outcome = await setMemberSwitches(db, actor, userId, body.value, now);
      if (outcome.ok) return json({ permissions: outcome.permissions });
      switch (outcome.reason) {
        case "owner-only":
          return json({ error: "owner-only" }, 403);
        case "not-found":
          return json({ error: "not-found" }, 404);
        case "owner":
        case "leaving":
          return json({ error: outcome.reason }, 409);
      }
    },
    { permission: "members.permissions" },
  )(request);
}
