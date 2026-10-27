import { guardStorage, json, rateLimit, readJson } from "@/lib/share/http";
import { stateSchema } from "@/lib/share/schemas";
import { canCreateShares, shareServices } from "@/lib/share/server";
import { createShare } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/shares` with the project's state: creates a share and returns
 * `{ shareId, token, ownerKey, missingBlobs }`. Token and owner key are shown once.
 * A 503 `{ error: "storage-unavailable" }` on a Vercel deployment with no
 * database, where the link wouldn't survive (see `canCreateShares`).
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "create");
  if (limited) return limited;
  if (!canCreateShares()) return json({ error: "storage-unavailable" }, 503);
  const body = await readJson(request, stateSchema);
  if (!body.ok) return body.response;
  const state = body.value;
  return guardStorage(async () =>
    json(await createShare(await shareServices(), state, Date.now()), 201),
  );
}
