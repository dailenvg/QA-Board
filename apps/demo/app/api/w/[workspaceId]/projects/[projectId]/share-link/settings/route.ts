import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { idSchema, shareSettingsSchema } from "@/lib/workspace/schemas";
import { changeShareSettings } from "@/lib/workspace/share-links";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/**
 * `PATCH { reviewWindow }`: how long the clients of the project's review link
 * can comment (`24h`, `72h`, `7d` or `none`), still counted from when the link
 * was created. Answers the window as it now stands (`ReviewWindowState`).
 * 404 for a project without a link, or not in this workspace; 400 for any
 * other window.
 */
export const PATCH = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, shareSettingsSchema);
  if (!body.ok) return body.response;
  const changed = await changeShareSettings(
    db,
    { userId: user.id, workspaceId },
    projectId,
    body.value,
    now,
  );
  return changed ? json(changed) : notFound();
});
