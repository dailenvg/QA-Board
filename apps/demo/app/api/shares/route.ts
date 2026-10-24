import { guardStorage, json, rateLimit, readJson } from "@/lib/share/http";
import { stateSchema } from "@/lib/share/schemas";
import { shareServices } from "@/lib/share/server";
import { createShare } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/shares` with the project's state: creates a share and returns
 * `{ shareId, token, ownerKey, missingBlobs }`. Token and owner key are shown once.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "create");
  if (limited) return limited;
  const body = await readJson(request, stateSchema);
  if (!body.ok) return body.response;
  const state = body.value;
  return guardStorage(async () =>
    json(await createShare(await shareServices(), state, Date.now()), 201),
  );
}
