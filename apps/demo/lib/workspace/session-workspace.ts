import { cache } from "react";
import { requireMember, requireSession } from "../auth/guards";
import { describeError } from "../auth/http";
import { findOwnWorkspace } from "../auth/memberships";
import type { SessionUser } from "../auth/users";
import { database } from "../db/database";
import { loadWorkspace } from "./load-workspace";
import { getShareLink } from "./share-links";
import type { ShareLink, WorkspaceStart } from "./types";

/**
 * What a signed-in page shows: the user's workspace, read on the server; none
 * (the admin, who belongs to no workspace); or unavailable, when reading it
 * failed (logged by kind only).
 */
export type SessionWorkspace =
  | { kind: "ready"; user: SessionUser; start: WorkspaceStart }
  | { kind: "none"; user: SessionUser }
  | { kind: "unavailable"; user: SessionUser };

/**
 * The signed-in user's workspace for the dashboard and viewer layouts. Sends
 * anyone signed out to /login (`requireSession`), and checks the membership
 * with `requireMember` before reading anything. One read per request.
 */
export const loadSessionWorkspace = cache(async (): Promise<SessionWorkspace> => {
  const user = await requireSession();
  const pending = database();
  if (!pending) return { kind: "unavailable", user };
  let workspaceId: string | null;
  try {
    workspaceId = (await findOwnWorkspace(await pending, user.id))?.workspaceId ?? null;
  } catch (error) {
    console.error(`squint workspace: page load failed (${describeError(error)})`);
    return { kind: "unavailable", user };
  }
  if (!workspaceId) return { kind: "none", user };
  const { membership } = await requireMember(workspaceId);
  try {
    const db = await pending;
    const data = await loadWorkspace(db, membership, user.id);
    const links = await Promise.all(
      data.projects
        .filter((project) => project.share)
        .map((project) => getShareLink(db, membership.workspaceId, project.id)),
    );
    return {
      kind: "ready",
      user,
      start: { data, links: links.filter((link): link is ShareLink => link !== null) },
    };
  } catch (error) {
    console.error(`squint workspace: page load failed (${describeError(error)})`);
    return { kind: "unavailable", user };
  }
});
