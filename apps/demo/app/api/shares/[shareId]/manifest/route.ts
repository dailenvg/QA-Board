import { json } from "@/lib/share/http";
import { asOwner } from "@/lib/share/routes";
import { shareManifest } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareId: string }> };

/** `GET`: the share's ids and content digests, and the images it still lacks. */
export async function GET(request: Request, { params }: Params) {
  const { shareId } = await params;
  return asOwner(request, shareId, "ownerRead", async ({ services, share }) =>
    json(await shareManifest(services.store, share)),
  );
}
