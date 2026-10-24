import { json, readJson } from "@/lib/share/http";
import { asOwner } from "@/lib/share/routes";
import { pushSchema } from "@/lib/share/schemas";
import { pushState, revokeShare } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareId: string }> };

/** `PUT`: the owner's whole state; the server matches it. Returns `{ missingBlobs }`. */
export async function PUT(request: Request, { params }: Params) {
  const { shareId } = await params;
  return asOwner(request, shareId, "ownerWrite", async ({ services, share }) => {
    const body = await readJson(request, pushSchema);
    if (!body.ok) return body.response;
    const { state, cursor } = body.value;
    return json(await pushState(services, share, state, cursor, Date.now()));
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
