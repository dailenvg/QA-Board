import { imageResponse, json, readBytes } from "@/lib/share/http";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { blobLimit } from "@/lib/workspace/blob-paths";
import { deleteBlob, findBlob } from "@/lib/workspace/blobs";
import { noContent, notFound, param, refusal } from "@/lib/workspace/http";
import { blobKeySchema, idSchema } from "@/lib/workspace/schemas";
import { storeInline } from "@/lib/workspace/uploads";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; projectId: string; key: string };

/** The project and logical key (`page:<id>`…) from the path; null answers 404. */
function target(params: Params) {
  const projectId = param(idSchema, params.projectId);
  const key = param(blobKeySchema, params.key);
  return projectId && key ? { projectId, key } : null;
}

/** `GET`: the file's bytes (a `Range` request gets at most 4 MB, as for shares). */
export const GET = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const file = target(params);
  const blob = file && (await findBlob(db, workspaceId, file.projectId, file.key));
  if (!blob) return notFound();
  const bytes = await blobDriverFromEnv().read(blob.location);
  if (!bytes) return notFound();
  return imageResponse(bytes, blob.contentType, request.headers.get("range"));
});

/**
 * `PUT` with the image bytes: stores the file in its row, without Vercel Blob
 * (local development and e2e). With Vercel Blob, 409 `use-client-upload`
 * (`blobs/token`, then `blobs/commit`). Never replaces a stored file.
 */
export const PUT = withMember<Params>(
  async (request, { db, workspaceId }, params) => {
    const file = target(params);
    if (!file) return notFound();
    if (blobDriverFromEnv().kind !== "inline") return json({ error: "use-client-upload" }, 409);
    const bytes = await readBytes(request, blobLimit(file.key));
    if (!bytes) return refusal("too-large");
    const stored = await storeInline(db, workspaceId, file, bytes);
    return stored.ok
      ? json(stored.value, stored.value.created ? 201 : 200)
      : refusal(stored.reason);
  },
  { body: "bytes" },
);

/** `DELETE`: deletes the file and its row. */
export const DELETE = withMember<Params>(async (_request, { db, workspaceId }, params) => {
  const file = target(params);
  const location = file && (await deleteBlob(db, workspaceId, file.projectId, file.key));
  if (!location) return notFound();
  await blobDriverFromEnv().discard([location]);
  return noContent();
});
