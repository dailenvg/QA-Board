import { createPinpointHandler, type PinpointHandler } from "@pinpoint/server";
import { pinpointRateLimit } from "@/lib/pinpoint-rate-limit";
import { storageFromEnv } from "@/lib/pinpoint-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: PinpointHandler | undefined;

/** Created on first request so `next build` never needs runtime secrets. */
function pinpoint(): PinpointHandler {
  handler ??= createPinpointHandler({
    storage: storageFromEnv().storage,
    rateLimit: pinpointRateLimit(),
  });
  return handler;
}

export const GET = (request: Request) => pinpoint().GET(request);
export const POST = (request: Request) => pinpoint().POST(request);
export const PATCH = (request: Request) => pinpoint().PATCH(request);
