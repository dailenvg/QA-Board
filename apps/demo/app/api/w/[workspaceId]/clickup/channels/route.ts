import { clickUpApiUrl } from "@/lib/integrations/clickup/config";
import { clickUpRefusal, clickUpUnavailable } from "@/lib/integrations/clickup/responses";
import { listClickUpChannels } from "@/lib/integrations/clickup/chat-api";
import { loadClickUpList } from "@/lib/integrations/clickup/send";
import { json } from "@/lib/share/http";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET`: the signed-in member's ClickUp channels, read with their own token
 * (`{ channels: [{ id, name }] }`, by name; no DMs, archived or hidden
 * channels). 409 `not-connected`, 422 `reconnect` (ClickUp's 401 or 403
 * on reading), 429 `rate-limited`, 502 `unreachable`, 503 `unavailable`.
 */
export const GET = withMember(async (_request, { db, user, workspaceId, now }) => {
  const apiUrl = clickUpApiUrl();
  if (!apiUrl) return clickUpUnavailable();
  const actor = { userId: user.id, workspaceId };
  const list = { what: "channels", read: listClickUpChannels };
  const outcome = await loadClickUpList(db, actor, list, now, { apiUrl });
  return outcome.ok ? json({ channels: outcome.items }) : clickUpRefusal(outcome);
});
