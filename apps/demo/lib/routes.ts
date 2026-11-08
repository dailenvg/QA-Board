/** App routes. Build links through these so every page agrees on the shape. */
export const OVERVIEW_HREF = "/";

export function folderHref(folderId: string): string {
  return `/f/${encodeURIComponent(folderId)}`;
}

export function projectHref(projectId: string): string {
  return `/p/${encodeURIComponent(projectId)}`;
}

/** Account settings; it opens on its first section, the profile. */
export const ACCOUNT_HREF = "/account";
export const ACCOUNT_PROFILE_HREF = "/account/profile";

/** Whether `pathname` is in the account settings. */
export function isAccountPath(pathname: string): boolean {
  return pathname === ACCOUNT_HREF || pathname.startsWith(`${ACCOUNT_HREF}/`);
}

/** Sign in again, with the notice for a confirmed email change. */
export const EMAIL_CHANGED_HREF = "/login?email=changed";
