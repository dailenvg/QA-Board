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

/** Account settings; it opens on its first section, the profile. */
export const ACCOUNT_HREF = "/account";
export const ACCOUNT_PROFILE_HREF = "/account/profile";
export const ACCOUNT_WORKSPACE_HREF = "/account/workspace";
export const ACCOUNT_STORAGE_HREF = "/account/storage";
/** The profile's ClickUp card, where a member connects their own ClickUp. */
export const ACCOUNT_CLICKUP_HREF = `${ACCOUNT_PROFILE_HREF}#clickup`;

/** The signed-in user's avatar, at a version (`?v=`) that changes with each new one. */
export function avatarSrc(version: string): string {
  return `/api/account/avatar?v=${encodeURIComponent(version)}`;
}

/** The logo of the signed-in user's workspace, at a version that changes with each new one. */
export function workspaceLogoSrc(version: string): string {
  return `/api/account/workspace/logo?v=${encodeURIComponent(version)}`;
}

/** Whether `pathname` is in the account settings. */
export function isAccountPath(pathname: string): boolean {
  return pathname === ACCOUNT_HREF || pathname.startsWith(`${ACCOUNT_HREF}/`);
}

/** Sign in again, with the notice for a confirmed email change. */
export const EMAIL_CHANGED_HREF = "/login?email=changed";
