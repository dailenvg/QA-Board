import { workspaceSettingsSchema } from "@/lib/account/schemas";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { updateWorkspaceSettings } from "@/lib/account/workspace-settings";
import { json, readJson } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `PATCH { name, brandColor, senderName }`: saves the settings of the
 * workspace the signed-in user owns (never one named in the body). The
 * color is `#rrggbb` that stands out on white, or null; the sender name 1 to
 * 64 characters, or null. Answers the values as saved; 400 with the field
 * that breaks a rule, 403 `owner-only` for a member who isn't the owner.
 */
export const PATCH = withOwnWorkspace(
  async (request, { db, user, membership, now }) => {
    const body = await readJson(request, workspaceSettingsSchema);
    if (!body.ok) return body.response;
    await updateWorkspaceSettings(
      db,
      { userId: user.id, workspaceId: membership.workspaceId },
      body.value,
      now,
    );
    return json(body.value);
  },
  { owner: true },
);
