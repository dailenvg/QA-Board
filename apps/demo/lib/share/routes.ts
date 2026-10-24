import { guardStorage, notFound, rateLimit, type LimitName } from "./http";
import { OWNER_KEY_HEADER } from "./http-headers";
import { shareServices, type ShareServices } from "./server";
import { clientShare, ownerShare } from "./service";
import type { ShareRecord } from "./types";

export interface ShareContext {
  services: ShareServices;
  share: ShareRecord;
}

type Handler = (context: ShareContext) => Promise<Response>;

/**
 * Rate limit, then the owner key from `x-squint-owner-key`; anything wrong is a
 * plain 404, and a storage failure a JSON 500.
 */
export async function asOwner(
  request: Request,
  shareId: string,
  limit: LimitName,
  run: Handler,
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  return guardStorage(async () => {
    const services = await shareServices();
    const key = request.headers.get(OWNER_KEY_HEADER);
    const share = await ownerShare(services.store, shareId, key);
    return share ? run({ services, share }) : notFound();
  });
}

/**
 * Rate limit, then the share token from the path; unknown or revoked is a
 * plain 404, and a storage failure a JSON 500.
 */
export async function asClient(
  request: Request,
  token: string,
  limit: LimitName,
  run: Handler,
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  return guardStorage(async () => {
    const services = await shareServices();
    const share = await clientShare(services.store, token);
    return share ? run({ services, share }) : notFound();
  });
}
