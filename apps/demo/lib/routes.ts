/** App routes. Build links through these so every page agrees on the shape. */
export const OVERVIEW_HREF = "/";

/** Every top-level folder, as a grid; each folder's own page is `folderHref`. */
export const FOLDERS_HREF = "/folders";

export function folderHref(folderId: string): string {
  return `/f/${encodeURIComponent(folderId)}`;
}

/** Whether `pathname` is in the Folders section: the folder grid, or a folder's page. */
export function isFoldersPath(pathname: string): boolean {
  return pathname === FOLDERS_HREF || pathname.startsWith("/f/");
}

export function projectHref(projectId: string): string {
  return `/p/${encodeURIComponent(projectId)}`;
}

/** A project link's preview card, as link unfurlers (and the Send to ClickUp preview) get it. */
export function projectCardHref(projectId: string): string {
  return `${projectHref(projectId)}/opengraph-image`;
}

/** Account settings; it opens on its first section, the profile. */
export const ACCOUNT_HREF = "/account";
export const ACCOUNT_PROFILE_HREF = "/account/profile";
export const ACCOUNT_WORKSPACE_HREF = "/account/workspace";
export const ACCOUNT_MEMBERS_HREF = "/account/members";
export const ACCOUNT_STORAGE_HREF = "/account/storage";
/** The profile's ClickUp card, where a member connects their own ClickUp. */
export const ACCOUNT_CLICKUP_HREF = `${ACCOUNT_PROFILE_HREF}#clickup`;

/** The signed-in user's avatar, at a version (`?v=`) that changes with each new one. */
export function avatarSrc(version: string): string {
  return `/api/account/avatar?v=${encodeURIComponent(version)}`;
}

/**
 * A member's avatar in their workspace, by their opaque person key, at a
 * version that changes with each new one.
 */
export function personAvatarSrc(workspaceId: string, personKey: string, version: string): string {
  return `/api/w/${encodeURIComponent(workspaceId)}/people/${encodeURIComponent(personKey)}/avatar?v=${encodeURIComponent(version)}`;
}

/** The logo of the signed-in user's workspace, at a version that changes with each new one. */
export function workspaceLogoSrc(version: string): string {
  return `/api/account/workspace/logo?v=${encodeURIComponent(version)}`;
}

/**
 * The company icon of the signed-in user's workspace (its logo, or its
 * default mark), at a version that changes with its name, color or logo: the
 * badge on the team's avatars in the app.
 */
export function workspaceIconSrc(version: string): string {
  return `/api/account/workspace/icon?v=${encodeURIComponent(version)}`;
}

/**
 * A workspace's company icon for anyone signed out (an invite email's
 * header), by its opaque key (`workspaceIconKey`), at a version that changes
 * with its name, color or logo.
 */
export function publicWorkspaceIconSrc(key: string, version: string): string {
  return `/api/c/${encodeURIComponent(key)}/brand/icon?v=${encodeURIComponent(version)}`;
}

/** A review link's company icon, at the version its brand says (`ClientBrand.iconVersion`). */
export function shareIconSrc(token: string, version: string): string {
  return `/api/s/${encodeURIComponent(token)}/brand/icon?v=${encodeURIComponent(version)}`;
}

/** A team member's avatar on a review link, by their key on that link, at its version there. */
export function sharePersonAvatarSrc(token: string, key: string, version: string): string {
  return `/api/s/${encodeURIComponent(token)}/people/${encodeURIComponent(key)}/avatar?v=${encodeURIComponent(version)}`;
}

/** Whether `pathname` is in the account settings. */
export function isAccountPath(pathname: string): boolean {
  return pathname === ACCOUNT_HREF || pathname.startsWith(`${ACCOUNT_HREF}/`);
}

/** The admin panel, for the Squint admin only: its Overview, and the audit log. */
export const ADMIN_HREF = "/admin";
export const ADMIN_AUDIT_HREF = "/admin/audit";

/** Whether `pathname` is in the admin panel. */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_HREF || pathname.startsWith(`${ADMIN_HREF}/`);
}

/** Sign in again, with the notice for a confirmed email change. */
export const EMAIL_CHANGED_HREF = "/login?email=changed";
