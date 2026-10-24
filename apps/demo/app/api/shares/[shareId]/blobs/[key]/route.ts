import { failure, imageResponse, json, notFound, readBytes, validate } from "@/lib/share/http";
import { asOwner } from "@/lib/share/routes";
import { blobKeySchema, SHARE_LIMITS } from "@/lib/share/schemas";
import { putOwnerBlob, readBlob } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareId: string; key: string }> };

/** `PUT` raw image bytes for a blob the share's data points at. */
export async function PUT(request: Request, { params }: Params) {
  const { shareId, key: rawKey } = await params;
  return asOwner(request, shareId, "ownerWrite", async ({ services, share }) => {
    const key = validate(blobKeySchema, decodeURIComponent(rawKey));
    if (!key.ok) return key.response;
    const bytes = await readBytes(request, SHARE_LIMITS.blobBytes.image);
    if (!bytes) return json({ error: "too-large" }, 413);
    const stored = await putOwnerBlob(services, share, key.value, bytes);
    return stored.ok ? json(stored.value) : failure(stored);
  });
}

/** `GET`: the owner downloads client crops and snapshots to merge them locally. */
export async function GET(request: Request, { params }: Params) {
  const { shareId, key: rawKey } = await params;
  return asOwner(request, shareId, "ownerRead", async ({ services, share }) => {
    const key = validate(blobKeySchema, decodeURIComponent(rawKey));
    if (!key.ok) return notFound();
    const blob = await readBlob(services, share, key.value);
    return blob ? imageResponse(blob.bytes, blob.contentType) : notFound();
  });
}
