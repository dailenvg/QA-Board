/** One listed Blob file: the fields of `@vercel/blob`'s `list()` the sweep reads. */
export interface ListedBlob {
  url: string;
  pathname: string;
  uploadedAt: Date;
}

/** The slice of `@vercel/blob` the sweep uses, bound to Squint's prefix and token. */
export interface BlobLister {
  list(cursor?: string): Promise<{ blobs: ListedBlob[]; cursor?: string; hasMore: boolean }>;
  del(urls: string[]): Promise<void>;
}

export interface SweepResult {
  deleted: number;
  /** False when `deadline` passed first; the next run goes on from the start. */
  done: boolean;
}

/** Files per `del` call: few enough for one request. */
const DELETE_BATCH = 100;

/** The share a Blob file belongs to, from `squint/<shareId>/<key>`; null for anything else. */
export function shareIdOf(pathname: string): string | null {
  return /^squint\/([A-Za-z0-9_-]+)\//.exec(pathname)?.[1] ?? null;
}

/**
 * Deletes Squint's Blob files uploaded before `before` (epoch ms) whose share
 * no longer exists: what a failed delete left behind. A live share's files and
 * paths it doesn't recognize are never touched. Pages through the listing
 * until it ends or `deadline` (epoch ms) passes.
 */
export async function sweepOrphanBlobs(
  api: BlobLister,
  before: number,
  isLive: (shareId: string) => Promise<boolean>,
  deadline: number,
): Promise<SweepResult> {
  const known = new Map<string, boolean>();
  const live = async (shareId: string) => {
    const cached = known.get(shareId);
    if (cached !== undefined) return cached;
    const found = await isLive(shareId);
    known.set(shareId, found);
    return found;
  };
  let deleted = 0;
  let cursor: string | undefined;
  do {
    if (Date.now() >= deadline) return { deleted, done: false };
    const page = await api.list(cursor);
    const orphans: string[] = [];
    for (const blob of page.blobs) {
      const shareId = shareIdOf(blob.pathname);
      if (shareId && blob.uploadedAt.getTime() < before && !(await live(shareId))) {
        orphans.push(blob.url);
      }
    }
    for (let start = 0; start < orphans.length; start += DELETE_BATCH) {
      await api.del(orphans.slice(start, start + DELETE_BATCH));
    }
    deleted += orphans.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return { deleted, done: true };
}
