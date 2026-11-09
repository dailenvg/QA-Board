import { cache } from "react";
import { requireMember, requireSession } from "../auth/guards";
import { describeError } from "../auth/http";
import { findOwnWorkspace } from "../auth/memberships";
import { database } from "../db/database";
import { avatarSrc, workspaceLogoSrc } from "../routes";
import { avatarVersion } from "./avatar";
import { loadWorkspaceSettings, type WorkspaceSettings } from "./workspace-settings";

/**
 * What the account pages and the workspace shell read on the server for the
 * signed-in user, beyond the session itself.
 */

/**
 * The signed-in user's avatar's `?v=`, or null without one, without a
 * database, or when reading it fails (logged by kind only): the shell shows
 * the email alone then. One read per request.
 */
export const sessionAvatarVersion = cache(async (userId: string): Promise<string | null> => {
  const pending = database();
  if (!pending) return null;
  try {
    return await avatarVersion(await pending, userId);
  } catch (error) {
    console.error(`squint account: avatar read failed (${describeError(error)})`);
    return null;
  }
});

/** `sessionAvatarVersion`, as the avatar's URL. */
export async function sessionAvatarSrc(userId: string): Promise<string | null> {
  const version = await sessionAvatarVersion(userId);
  return version && avatarSrc(version);
}

/** What the Overview's header shows of the workspace. */
export interface WorkspaceIdentity {
  name: string;
  /** `#rrggbb`, or null: the monogram sits on the neutral navy. */
  brandColor: string | null;
  /** The logo's URL, versioned so a new logo is a new URL; null without one. */
  logoSrc: string | null;
}

/**
 * The name, brand color and logo of a workspace the session's user is
 * already known to belong to (`loadSessionWorkspace` checked). If reading
 * them fails (logged by kind only), `name` alone: the header shows its monogram.
 */
export const sessionWorkspaceIdentity = cache(
  async (workspaceId: string, name: string): Promise<WorkspaceIdentity> => {
    const plain = { name, brandColor: null, logoSrc: null };
    const pending = database();
    if (!pending) return plain;
    try {
      const settings = await loadWorkspaceSettings(await pending, workspaceId);
      if (!settings) return plain;
      return {
        name: settings.name,
        brandColor: settings.brandColor,
        logoSrc: settings.logoVersion && workspaceLogoSrc(settings.logoVersion),
      };
    } catch (error) {
      console.error(`squint account: workspace identity read failed (${describeError(error)})`);
      return plain;
    }
  },
);

/**
 * The workspace settings page: the settings of the signed-in user's
 * workspace and whether they own it; none (the admin, in no workspace); or
 * unavailable, when reading failed (logged by kind only).
 */
export type WorkspaceSettingsPage =
  | { kind: "ready"; settings: WorkspaceSettings; isOwner: boolean }
  | { kind: "none" }
  | { kind: "unavailable" };

export async function loadWorkspaceSettingsPage(): Promise<WorkspaceSettingsPage> {
  const user = await requireSession();
  const pending = database();
  if (!pending) return { kind: "unavailable" };
  let membership;
  try {
    membership = await findOwnWorkspace(await pending, user.id);
  } catch (error) {
    console.error(`squint account: workspace settings read failed (${describeError(error)})`);
    return { kind: "unavailable" };
  }
  if (!membership) return { kind: "none" };
  await requireMember(membership.workspaceId);
  try {
    const settings = await loadWorkspaceSettings(await pending, membership.workspaceId);
    if (!settings) return { kind: "none" };
    return { kind: "ready", settings, isOwner: membership.role === "owner" };
  } catch (error) {
    console.error(`squint account: workspace settings read failed (${describeError(error)})`);
    return { kind: "unavailable" };
  }
}
