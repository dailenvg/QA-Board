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
 * `POST { width }`: snapshots the shared project's own address (the client
 * never sends one) through the guarded capture, and adds it to the share.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  return asClient(request, token, "clientCapture", async ({ services, share }) => {
    const body = await readJson(request, captureSchema);
    if (!body.ok) return body.response;
    try {
      const width = clampWidth(body.value.width);
      const added = await captureForClient(services, share, width, capture, Date.now());
      return added.ok ? json(added.value, 201) : failure(added);
    } catch (error) {
      return captureFailure(error instanceof CaptureError ? error.code : "failed");
    }
  });
}
