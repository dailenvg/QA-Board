import { json } from "@/lib/share/http";
import { shareServices } from "@/lib/share/server";
import { revokeShare } from "@/lib/share/service";
import { noContent, notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { isLiveProject } from "@/lib/workspace/projects";
import { idSchema, shareAttachSchema, shareSyncSchema } from "@/lib/workspace/schemas";
import {
  attachShare,
  getShareLink,
  projectShareIds,
  syncShareLink,
} from "@/lib/workspace/share-links";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/** `GET`: the project's review link with its token and owner key (`ShareLink`); 404 without one. */
export const GET = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  const link = projectId && (await getShareLink(db, workspaceId, projectId));
  return link ? json(link) : notFound();
});

/**
 * `PUT { shareId, token, ownerKey, reviewWindow? }`: makes a share (from
 * `POST /api/shares`) the project's review link, with the review window
 * chosen for it (`24h`, `72h`, `7d` or `none`; kept as it is when left out).
 * The member attaching it is recorded as who invited its reviewers, unless
 * someone already is. The owner key and token must match the share; any
 * mismatch answers 404 like an unknown share. 409 `linked` when the project
 * already has another link (delete that first).
 */
export const PUT = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, shareAttachSchema);
  if (!body.ok) return body.response;
  const attached = await db.transaction((tx) =>
    attachShare(tx, workspaceId, projectId, { ...body.value, invitedBy: user.id }, now),
  );
  if (!attached.ok) return refusal(attached.reason);
  const link = await getShareLink(db, workspaceId, projectId);
  return link ? json(link) : notFound();
});

/** `PATCH { cursor, lastSyncedAt }`: records the owner's pull position. */
export const PATCH = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, shareSyncSchema);
  if (!body.ok) return body.response;
  return (await syncShareLink(db, workspaceId, projectId, body.value)) ? noContent() : notFound();
});

/** `DELETE`: revokes the project's review link; the link stops working at once. */
export const DELETE = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId || !(await isLiveProject(db, workspaceId, projectId))) return notFound();
  const shareIds = await projectShareIds(db, workspaceId, projectId);
  if (shareIds.length === 0) return notFound();
  const services = await shareServices();
  for (const id of shareIds) await revokeShare(services, { id });
  return noContent();
});
