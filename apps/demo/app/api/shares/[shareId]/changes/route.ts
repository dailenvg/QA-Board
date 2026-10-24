import { json } from "@/lib/share/http";
import { asOwner } from "@/lib/share/routes";
import { expireStalePending, pullChanges } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ shareId: string }> };

/** `GET ?since=<cursor>`: client comments and snapshots added after the cursor. */
export async function GET(request: Request, { params }: Params) {
  const { shareId } = await params;
  return asOwner(request, shareId, "ownerRead", async ({ services, share }) => {
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    if (!Number.isInteger(since) || since < 0)
      return json({ error: "invalid", field: "since" }, 400);
    // Opportunistic: comments orphaned mid-post don't pile up.
    await expireStalePending(services, share, Date.now());
    return json(await pullChanges(services.store, share, since));
  });
}
