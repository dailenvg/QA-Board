import { clickUpApiUrl } from "@/lib/integrations/clickup/config";
import { clickUpRefusal, clickUpUnavailable } from "@/lib/integrations/clickup/responses";
import { listClickUpPeople } from "@/lib/integrations/clickup/api";
import { loadClickUpList } from "@/lib/integrations/clickup/send";
import { json } from "@/lib/share/http";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET`: the people in the signed-in member's connected ClickUp workspace,
 * read with their own token (`{ people: [{ id, username, email }] }`, by
 * name), to assign a message to. Refuses as
 * `GET .../clickup/channels` does.
 */
export const GET = withMember(async (_request, { db, user, workspaceId, now }) => {
  const apiUrl = clickUpApiUrl();
  if (!apiUrl) return clickUpUnavailable();
  const actor = { userId: user.id, workspaceId };
  const list = { what: "people", read: listClickUpPeople };
  const outcome = await loadClickUpList(db, actor, list, now, { apiUrl });
  return outcome.ok ? json({ people: outcome.items }) : clickUpRefusal(outcome);
});
