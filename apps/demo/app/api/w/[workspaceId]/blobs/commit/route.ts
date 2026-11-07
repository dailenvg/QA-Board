import { json } from "@/lib/share/http";
import { blobDriverFromEnv } from "@/lib/workspace/blob-driver";
import { readBody, refusal } from "@/lib/workspace/http";
import { blobCommitSchema } from "@/lib/workspace/schemas";
import { commitUpload } from "@/lib/workspace/uploads";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/**
 * `POST { projectId, key }` after a client upload: checks the file is in the
 * store at its fixed path and records it (201; 200 when it already was).
 * 404 `not-uploaded` when it isn't there; 413 `quota` deletes it.
 */
export const POST = withMember<Params>(async (request, { db, workspaceId }) => {
  const body = await readBody(request, blobCommitSchema);
  if (!body.ok) return body.response;
  const driver = blobDriverFromEnv();
  if (driver.kind !== "vercel") return json({ error: "inline-uploads" }, 409);
  const committed = await commitUpload(db, driver, workspaceId, body.value);
  if (!committed.ok) return refusal(committed.reason);
  return json(committed.value, committed.value.created ? 201 : 200);
});
