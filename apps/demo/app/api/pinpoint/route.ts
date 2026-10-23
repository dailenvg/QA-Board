import { createPinpointHandler, type PinpointHandler } from "@pinpoint/server";
import { storageFromEnv } from "@/lib/pinpoint-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: PinpointHandler | undefined;

/** Optional override for the per-IP POST limit (default 10 per minute). */
function rateLimitFromEnv() {
  const perMinute = Number(process.env.PINPOINT_RATE_LIMIT);
  return Number.isInteger(perMinute) && perMinute > 0 ? { limit: perMinute } : undefined;
}

/** Created on first request so `next build` never needs runtime secrets. */
function pinpoint(): PinpointHandler {
  handler ??= createPinpointHandler({
    storage: storageFromEnv().storage,
    rateLimit: rateLimitFromEnv(),
  });
  return handler;
}

export const GET = (request: Request) => pinpoint().GET(request);
export const POST = (request: Request) => pinpoint().POST(request);
export const PATCH = (request: Request) => pinpoint().PATCH(request);
