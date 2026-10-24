import { probeFraming } from "@/lib/frame-check/probe";
import type { FrameCheckResult } from "@/lib/frame-check/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2048;
const NO_STORE = { "cache-control": "no-store" };

/** `GET /api/frame-check?url=`: can this page be shown in an iframe on this app? */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("url");
  if (!target || target.length > MAX_URL_LENGTH) {
    const invalid: FrameCheckResult = { verdict: "unknown", reason: "invalid-url" };
    return Response.json(invalid, { status: 400, headers: NO_STORE });
  }
  const result = await probeFraming(target, requestUrl.origin);
  return Response.json(result, { headers: NO_STORE });
}
