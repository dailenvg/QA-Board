import { apiMember } from "../auth/guards";
import { crossSiteRefusal, describeError, isCrossSite } from "../auth/http";
import type { Membership } from "../auth/memberships";
import { defaultPermission, refusalFor, type Permission } from "../auth/permissions";
import type { SessionUser } from "../auth/users";
import type { Database } from "../db/database";
import { json } from "../share/http";
import { isBytesRequest, isJsonRequest } from "./http";

export interface Member {
  db: Database;
  user: SessionUser;
  membership: Membership;
  /** The session's workspace: the only workspace id a handler may use. */
  workspaceId: string;
  now: number;
}

/** What a write's body must be: JSON (most), or raw image bytes (an inline upload). */
type Body = "json" | "bytes";

type Handler<P> = (request: Request, member: Member, params: P) => Promise<Response>;

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** A write from another site, or with a body type a plain form could send: refused before any work. */
function refuseWrite(request: Request, body: Body): Response | null {
  if (!WRITES.has(request.method)) return null;
  if (isCrossSite(request)) return crossSiteRefusal();
  const typed = body === "json" ? isJsonRequest(request) : isBytesRequest(request);
  return typed ? null : json({ error: "unsupported-media-type" }, 415);
}

export interface MemberOptions {
  body?: Body;
  /** What the membership must allow (`can`); `defaultPermission` when left out. */
  permission?: Permission;
}

/**
 * Wraps every `/api/w/[workspaceId]/…` handler. In order: the session's
 * membership of the workspace (`apiMember`: 401, or 404 for any workspace it
 * isn't a member of); then, on writes, a same-site `Origin` and a JSON (or
 * image) body; then the permission (`refusalFor`: 403 `owner-only`, or 403
 * `not-allowed` for a switch that's off); then the handler, with the
 * session's workspace id. A storage failure answers a JSON 500 and logs only
 * the error's kind and code.
 */
export function withMember<P extends { workspaceId: string }>(
  run: Handler<P>,
  options: MemberOptions = {},
): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  return async (request, context) => {
    try {
      const params = await context.params;
      const member = await apiMember(request, params.workspaceId);
      if (!member.ok) return member.response;
      const refused =
        refuseWrite(request, options.body ?? "json") ??
        refusalFor(member.membership, options.permission ?? defaultPermission(request.method));
      if (refused) return refused;
      const { db, user, membership } = member;
      return await run(
        request,
        { db, user, membership, workspaceId: membership.workspaceId, now: Date.now() },
        params,
      );
    } catch (error) {
      console.error(`squint workspace: storage failed (${describeError(error)})`);
      return json({ error: "storage" }, 500);
    }
  };
}
