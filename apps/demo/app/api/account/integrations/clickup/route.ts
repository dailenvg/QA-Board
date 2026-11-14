import { rateLimited, withOwnWorkspace } from "@/lib/account/with-account";
import { clickUpApiUrl } from "@/lib/integrations/clickup/config";
import { claimClickUpAttempt, connectClickUp } from "@/lib/integrations/clickup/connect";
import { removeClickUpConnection } from "@/lib/integrations/clickup/connections";
import { clickUpConnectSchema } from "@/lib/integrations/clickup/schemas";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each refusal's status. */
const REFUSALS = {
  refused: 422,
  "no-workspace": 422,
  "unknown-team": 409,
  unreachable: 502,
} as const;

/**
 * `POST { token, teamId? }`: connects the signed-in member's own ClickUp, in
 * their workspace, with a personal API token (`connectClickUp`). Any member,
 * owner or not. Answers `{ connection }`; or `{ choose: teams }` when the
 * token reaches several ClickUp workspaces and no `teamId` was sent, saving
 * nothing. 400 for a token that isn't `pk_…`; 422 `refused` (ClickUp won't
 * take it) or `no-workspace`; 409 `unknown-team` (with `teams`); 502
 * `unreachable`; 503 `unavailable` when this site can't reach ClickUp; 429
 * past 20 tries in 10 minutes; 404 outside a workspace. Never answers the token.
 */
export const POST = withOwnWorkspace(async (request, { db, user, membership, now }) => {
  const apiUrl = clickUpApiUrl();
  if (!apiUrl) return json({ error: "unavailable" }, 503);
  const body = await readJson(request, clickUpConnectSchema);
  if (!body.ok) return body.response;
  const claim = claimClickUpAttempt(user.id, now);
  if (!claim.ok) return rateLimited(claim.retryAfterSeconds);
  const actor = { userId: user.id, workspaceId: membership.workspaceId };
  const outcome = await connectClickUp(db, actor, body.value, now, { apiUrl });
  switch (outcome.result) {
    case "connected":
      return json({ connection: outcome.connection });
    case "choose":
      return json({ choose: outcome.teams });
    case "unknown-team":
      return json({ error: outcome.result, teams: outcome.teams }, REFUSALS[outcome.result]);
    default:
      return json({ error: outcome.result }, REFUSALS[outcome.result]);
  }
});

/**
 * `DELETE {}`: disconnects the signed-in member's own ClickUp, forgetting
 * their token (which still works in ClickUp until they regenerate it).
 * `{ ok: true }` either way.
 */
export const DELETE = withOwnWorkspace(async (_request, { db, user, membership, now }) => {
  await removeClickUpConnection(db, { userId: user.id, workspaceId: membership.workspaceId }, now);
  return json({ ok: true });
});
