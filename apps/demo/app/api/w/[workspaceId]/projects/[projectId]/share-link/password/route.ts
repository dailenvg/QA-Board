import { json } from "@/lib/share/http";
import { notFound, param, readBody } from "@/lib/workspace/http";
import { idSchema, sharePasswordSchema } from "@/lib/workspace/schemas";
import { changeSharePassword } from "@/lib/workspace/share-links";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string };

/**
 * `PUT { password }`: sets or changes the password guests of the project's
 * review link must enter (8 to 128 characters, kept as typed). Every guest
 * pass issued before stops working. Answers `{ hasPassword, passwordSetAt }`,
 * never the password or its hash. 404 for a project without a link, or not in
 * this workspace; 400 for a password too short or too long.
 */
export const PUT = withMember<Params>(async (request, { db, user, workspaceId, now }, params) => {
  const projectId = param(idSchema, params.projectId);
  if (!projectId) return notFound();
  const body = await readBody(request, sharePasswordSchema);
  if (!body.ok) return body.response;
  const actor = { userId: user.id, workspaceId };
  const changed = await changeSharePassword(db, actor, projectId, body.value.password, now);
  return changed ? json(changed) : notFound();
});

/**
 * `DELETE`: removes the link's password; guests open it without one again.
 * Answers `{ hasPassword: false, passwordSetAt: null }`; 404 like `PUT`.
 */
export const DELETE = withMember<Params>(
  async (_request, { db, user, workspaceId, now }, params) => {
    const projectId = param(idSchema, params.projectId);
    if (!projectId) return notFound();
    const actor = { userId: user.id, workspaceId };
    const changed = await changeSharePassword(db, actor, projectId, null, now);
    return changed ? json(changed) : notFound();
  },
);
