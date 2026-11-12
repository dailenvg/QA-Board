import { verifyGuestPass } from "./guest-pass";
import { guardStorage, notFound, passwordRequired, rateLimit, type LimitName } from "./http";
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
 * Rate limit, then the owner key from `x-squint-owner-key`; anything wrong
 * (expired share included) is a plain 404, and a storage failure a JSON 500.
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
    const share = await ownerShare(services.store, shareId, key, Date.now());
    return share ? run({ services, share }) : notFound();
  });
}

/**
 * Rate limit, then the share token from the path; unknown, revoked or expired
 * is a plain 404, and a storage failure a JSON 500. Then the password gate: a
 * protected link without a valid guest pass (`verifyGuestPass`) is 401
 * `password-required`. Only what a locked link may still show passes
 * `{ gated: false }`: the company's logo, and the unlock route itself.
 */
export async function asClient(
  request: Request,
  token: string,
  limit: LimitName,
  run: Handler,
  { gated = true }: { gated?: boolean } = {},
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  return guardStorage(async () => {
    const services = await shareServices();
    const now = Date.now();
    const share = await clientShare(services.store, token, now);
    if (!share) return notFound();
    if (gated && !verifyGuestPass(request.headers.get("cookie"), share, now)) {
      return passwordRequired();
    }
    return run({ services, share });
  });
}
