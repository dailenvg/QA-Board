import { apiSignedIn } from "@/lib/auth/guards";
import { crossSiteRefusal, isCrossSite } from "@/lib/auth/http";
import { guardStorage, json, rateLimit, readJson } from "@/lib/share/http";
import { stateSchema } from "@/lib/share/schemas";
import { canCreateShares, shareServices } from "@/lib/share/server";
import { createShare } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/shares` with the project's state: creates a share and returns
 * `{ shareId, token, ownerKey, missingBlobs }`. Token and owner key are shown once.
 * Signed-in users only (401 otherwise), from this site (403 otherwise): links
 * are made from a workspace, then attached to its project. Existing links,
 * and their owner routes, work as before.
 * A 503 `{ error: "storage-unavailable" }` on a Vercel deployment with no
 * database, where the link wouldn't survive (see `canCreateShares`).
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return crossSiteRefusal();
  const limited = rateLimit(request, "create");
  if (limited) return limited;
  if (!canCreateShares()) return json({ error: "storage-unavailable" }, 503);
  return guardStorage(async () => {
    const session = await apiSignedIn(request);
    if (!session.ok) return session.response;
    const body = await readJson(request, stateSchema);
    if (!body.ok) return body.response;
    return json(await createShare(await shareServices(), body.value, Date.now()), 201);
  });
}
