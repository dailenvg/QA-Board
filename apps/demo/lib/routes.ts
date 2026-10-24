/** App routes. Build links through these so every page agrees on the shape. */
export const OVERVIEW_HREF = "/";

export function folderHref(folderId: string): string {
  return `/f/${encodeURIComponent(folderId)}`;
}

export function projectHref(projectId: string): string {
  return `/p/${encodeURIComponent(projectId)}`;
}
