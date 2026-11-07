import { json } from "@/lib/share/http";
import { readBody, refusal } from "@/lib/workspace/http";
import { importData } from "@/lib/workspace/import-data";
import { WORKSPACE_LIMITS } from "@/lib/workspace/limits";
import { importSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { workspaceId: string };

/**
 * `POST` with a browser's local data: imports it in one transaction and
 * answers `{ imported, skipped, projects, uploads }`. `projects` sorts the
 * request's projects into `imported` (made now), `existing` (already here
 * from an earlier import), `trashed` (already here, in the trash) and
 * `unlinked` (imported without their review link, which couldn't be proven);
 * any other was skipped because its folder isn't here. `uploads` lists every
 * file the request's live projects still lack, so a retry finds what an
 * earlier run didn't upload. Ids the workspace already has are skipped, so a
 * retry is safe. 409 `exists` when a project id belongs to another
 * workspace; nothing is imported then.
 */
export const POST = withMember<Params>(async (request, { db, user, workspaceId, now }) => {
  const body = await readBody(request, importSchema, WORKSPACE_LIMITS.importBytes);
  if (!body.ok) return body.response;
  const result = await importData(db, workspaceId, user.id, body.value, now);
  return result.ok ? json(result.value) : refusal(result.reason);
});
