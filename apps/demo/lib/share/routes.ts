import { notFound, OWNER_KEY_HEADER, rateLimit, type LimitName } from "./http";
import { shareServices, type ShareServices } from "./server";
import { clientShare, ownerShare } from "./service";
import type { ShareRecord } from "./types";

export interface ShareContext {
  services: ShareServices;
  share: ShareRecord;
}

type Handler = (context: ShareContext) => Promise<Response>;

/** Rate limit, then the owner key from `x-squint-owner-key`; anything wrong is a plain 404. */
export async function asOwner(
  request: Request,
  shareId: string,
  limit: LimitName,
  run: Handler,
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  const services = await shareServices();
  const share = await ownerShare(services.store, shareId, request.headers.get(OWNER_KEY_HEADER));
  return share ? run({ services, share }) : notFound();
}

/** Rate limit, then the share token from the path; unknown or revoked is a plain 404. */
export async function asClient(
  request: Request,
  token: string,
  limit: LimitName,
  run: Handler,
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  const services = await shareServices();
  const share = await clientShare(services.store, token);
  return share ? run({ services, share }) : notFound();
}
