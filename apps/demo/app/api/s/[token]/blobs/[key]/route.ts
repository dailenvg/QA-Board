import { imageResponse, notFound, validate } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { blobKeySchema } from "@/lib/share/schemas";
import { readBlob } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; key: string }> };

/** `GET`: one of the share's images, through the token. Blob URLs are never exposed. */
export async function GET(request: Request, { params }: Params) {
  const { token, key: rawKey } = await params;
  return asClient(request, token, "clientRead", async ({ services, share }) => {
    const key = validate(blobKeySchema, decodeURIComponent(rawKey));
    if (!key.ok) return notFound();
    const blob = await readBlob(services, share, key.value);
    return blob
      ? imageResponse(blob.bytes, blob.contentType, request.headers.get("range"))
      : notFound();
  });
}
