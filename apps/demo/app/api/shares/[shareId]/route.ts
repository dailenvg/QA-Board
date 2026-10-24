import { failure, json, readJson } from "@/lib/share/http";
import { asOwner } from "@/lib/share/routes";
import { changeSchema } from "@/lib/share/schemas";
import { applyChanges, revokeShare } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareId: string }> };

/**
 * `PATCH`: one batch of the owner's changes (upserts, and deletes of rows it
 * has seen). The browser sends only what differs from the manifest, in
 * batches, so no request outgrows the body limit. Returns `{ missingBlobs }`.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { shareId } = await params;
  return asOwner(request, shareId, "ownerWrite", async ({ services, share }) => {
    const body = await readJson(request, changeSchema);
    if (!body.ok) return body.response;
    const applied = await applyChanges(services, share, body.value, Date.now());
    return applied.ok ? json(applied.value) : failure(applied);
  });
}

/** `DELETE`: revokes the link and deletes everything the server holds for it. */
export async function DELETE(request: Request, { params }: Params) {
  const { shareId } = await params;
  return asOwner(request, shareId, "ownerWrite", async ({ services, share }) => {
    await revokeShare(services, share);
    return new Response(null, { status: 204 });
  });
}
