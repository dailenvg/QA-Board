import { clickUpApiUrl } from "@/lib/integrations/clickup/config";
import { clickUpRefusal, clickUpUnavailable } from "@/lib/integrations/clickup/responses";
import { clickUpSendSchema } from "@/lib/integrations/clickup/schemas";
import { sendProjectToClickUp } from "@/lib/integrations/clickup/send";
import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/**
 * `POST { channelId, note?, assignee? }`: posts the project to a ClickUp
 * channel as the signed-in member (`sendProjectToClickUp`): its name and
 * its page's address in Squint, the note, and who it's assigned to. Answers `{ url }`: the message's link when ClickUp
 * gives one, else null. 400 `invalid` with the field; 404 for a project
 * that isn't in the workspace (or is in the trash); 409 `archived`,
 * `not-connected`, `channel-gone` (ClickUp's 404) or `channel-forbidden`
 * (ClickUp's 403: the member can't post there); 422 `reconnect` (ClickUp's
 * 401); 429 `rate-limited` (20 per member in 10 minutes, or ClickUp's own)
 * with `Retry-After`; 502 `unreachable`; 503 `unavailable`.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const apiUrl = clickUpApiUrl();
  if (!apiUrl) return clickUpUnavailable();
  const body = await readBody(request, clickUpSendSchema);
  if (!body.ok) return body.response;
  const actor = { userId: user.id, workspaceId };
  const outcome = await sendProjectToClickUp(db, actor, projectId, body.value, now, { apiUrl });
  return outcome.ok ? json({ url: outcome.url }) : clickUpRefusal(outcome);
});
