import { json } from "@/lib/share/http";
import { createFolder, listFolders } from "@/lib/workspace/folders";
import { readBody, refusal } from "@/lib/workspace/http";
import { folderCreateSchema } from "@/lib/workspace/schemas";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/** `GET`: the workspace's folders. */
export const GET = withMember<Params>(async (_request, { db, workspaceId }) =>
  json(await listFolders(db, workspaceId)),
);

/** `POST { id, name, parentId? }`: a new folder (201); 409 when the id is taken. */
export const POST = withMember<Params>(async (request, { db, workspaceId, now }) => {
  const body = await readBody(request, folderCreateSchema);
  if (!body.ok) return body.response;
  const created = await createFolder(db, workspaceId, body.value, now);
  return created.ok ? json(created.value, 201) : refusal(created.reason);
});
