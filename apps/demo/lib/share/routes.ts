import { apiAccount } from "../auth/guards";
import { findMembership } from "../auth/memberships";
import { refusalFor, type Permission } from "../auth/permissions";
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
 * For a workspace's share, the key isn't enough: every member's browser holds
 * it, so a member who has left could keep one. The session (the cookie, sent
 * same-origin) must be a member of the share's workspace, a 404 otherwise,
 * and allow `permission` when there is one (403 `not-allowed` or
 * `owner-only`). An anonymous share has no workspace: its key is enough.
 */
async function memberRefusal(
  request: Request,
  share: ShareRecord,
  permission: Permission | undefined,
): Promise<Response | null> {
  if (!share.workspaceId) return null;
  const account = await apiAccount(request);
  if (!account.ok) return notFound();
  const membership = await findMembership(account.db, account.user.id, share.workspaceId);
  if (!membership) return notFound();
  return permission ? refusalFor(membership, permission) : null;
}

/**
 * Rate limit, then the owner key from `x-squint-owner-key`, then for a
 * workspace's share the session's membership of it (`memberRefusal`, with
 * `permission` when the route names one); anything wrong (expired share
 * included) is a plain 404, and a storage failure a JSON 500.
 */
export async function asOwner(
  request: Request,
  shareId: string,
  limit: LimitName,
  run: Handler,
  { permission }: { permission?: Permission } = {},
): Promise<Response> {
  const limited = rateLimit(request, limit);
  if (limited) return limited;
  return guardStorage(async () => {
    const services = await shareServices();
    const key = request.headers.get(OWNER_KEY_HEADER);
    const share = await ownerShare(services.store, shareId, key, Date.now());
    if (!share) return notFound();
    return (await memberRefusal(request, share, permission)) ?? run({ services, share });
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
