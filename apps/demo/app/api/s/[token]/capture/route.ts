import { capture } from "@/lib/capture/capture";
import { CaptureError } from "@/lib/capture/capture-error";
import { captureFailure } from "@/lib/capture/http";
import { clampWidth } from "@/lib/capture/types";
import { failure, json, readJson } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { captureSchema } from "@/lib/share/schemas";
import { captureForClient } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ token: string }> };

/**
 * `POST { width, url? }`: snapshots a page of the shared project's site (`url`,
 * which must be on the project's origin, else the project's own address)
 * through the guarded capture, and adds it to the share.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  return asClient(request, token, "clientCapture", async ({ services, share }) => {
    const body = await readJson(request, captureSchema);
    if (!body.ok) return body.response;
    try {
      const width = clampWidth(body.value.width);
      const { url = null } = body.value;
      const added = await captureForClient(services, share, width, capture, Date.now(), url);
      return added.ok ? json(added.value, 201) : failure(added);
    } catch (error) {
      return captureFailure(error instanceof CaptureError ? error.code : "failed");
    }
  });
}
