import { json } from "@/lib/share/http";
import { deleteFolder, updateFolder } from "@/lib/workspace/folders";
import { noContent, notFound, param, readBody, refusal } from "@/lib/workspace/http";
import { folderPatchSchema, idSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; folderId: string };

/** `PATCH { name?, parentId? }`: renames and/or moves the folder (never into itself). */
export const PATCH = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const folderId = param(idSchema, params.folderId);
  if (!folderId) return notFound();
  const body = await readBody(request, folderPatchSchema);
  if (!body.ok) return body.response;
  const updated = await updateFolder(db, workspaceId, folderId, body.value);
  return updated.ok ? json(updated.value) : refusal(updated.reason);
});

/**
 * `DELETE`: deletes the folder and its subfolders, once no live project is
 * left in them (409 `not-empty`). Trashed projects inside move to the
 * workspace root, still in the trash: restorable until their grace period
 * ends, and restored at the root.
 */
export const DELETE = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const folderId = param(idSchema, params.folderId);
  if (!folderId) return notFound();
  const deleted = await deleteFolder(db, workspaceId, folderId);
  return deleted.ok ? noContent() : refusal(deleted.reason);
});
