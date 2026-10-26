/**
 * A shared page's picture, in the share's blob keys: `page:<pageId>`, then
 * `page:<pageId>:<rev>` once it's been replaced, so a new picture is a new
 * key the owner uploads. Shared by server and browser.
 */
export function pageBlobKey(pageId: string, rev: number | undefined): string {
  return rev ? `page:${pageId}:${rev}` : `page:${pageId}`;
}

/** The page id and revision of a page blob key, or null for any other key. */
export function parsePageBlobKey(key: string): { pageId: string; rev: number } | null {
  const match = /^page:([A-Za-z0-9_-]{1,64})(?::(\d{1,9}))?$/.exec(key);
  return match?.[1] ? { pageId: match[1], rev: Number(match[2] ?? 0) } : null;
}
