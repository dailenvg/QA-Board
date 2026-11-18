/** One listed Blob file: the fields of `@vercel/blob`'s `list()` the sweep reads. */
export interface ListedBlob {
  url: string;
  pathname: string;
  uploadedAt: Date;
  /** Bytes, when the listing says (Vercel Blob's does), for the admin's dry run. */
  size?: number;
}

/** One page of Squint's Blob files, from `cursor` (the first page without one). */
export type ListBlobs = (
  cursor?: string,
) => Promise<{ blobs: ListedBlob[]; cursor?: string; hasMore: boolean }>;

/** The slice of `@vercel/blob` the sweep uses, bound to Squint's prefix and token. */
export interface BlobLister {
  list: ListBlobs;
  del(urls: string[]): Promise<void>;
}

export interface SweepResult {
  deleted: number;
  /** False when `deadline` passed first; the next run goes on from the start. */
  done: boolean;
}

/** How many files a sweep would delete, and their bytes (null when a file's size isn't known). */
export interface OrphanTally {
  files: number;
  bytes: number | null;
}

export const EMPTY_TALLY: OrphanTally = { files: 0, bytes: 0 };

/** `tally` with `files` added. */
export function addToTally(
  tally: OrphanTally,
  files: ReadonlyArray<{ size?: number | undefined }>,
): OrphanTally {
  let bytes = tally.bytes;
  for (const file of files) {
    bytes = bytes === null || file.size === undefined ? null : bytes + file.size;
  }
  return { files: tally.files + files.length, bytes };
}

/** A dry run's tally, and whether it got through the whole listing before `deadline`. */
export interface OrphanScan extends OrphanTally {
  done: boolean;
}

/** Files per `del` call: few enough for one request. */
const DELETE_BATCH = 100;

/** The share a Blob file belongs to, from `squint/<shareId>/<key>`; null for anything else. */
export function shareIdOf(pathname: string): string | null {
  return /^squint\/([A-Za-z0-9_-]+)\//.exec(pathname)?.[1] ?? null;
}

type IsLive = (shareId: string) => Promise<boolean>;

/** `isLive`, asked once per share however many files it has. */
function cachedIsLive(isLive: IsLive): IsLive {
  const known = new Map<string, boolean>();
  return async (shareId) => {
    const cached = known.get(shareId);
    if (cached !== undefined) return cached;
    const found = await isLive(shareId);
    known.set(shareId, found);
    return found;
  };
}

/**
 * Squint's Blob files uploaded before `before` (epoch ms) whose share no
 * longer exists: what a failed delete left behind. A live share's files and
 * paths it doesn't recognize never are. Pages through the listing, handing
 * each page's orphans to `onPage`, until it ends (true) or `deadline` (epoch
 * ms) passes before the next page (false). The one rule the sweep and the
 * admin's dry run share.
 */
async function walkOrphanBlobs(
  list: ListBlobs,
  before: number,
  isLive: IsLive,
  deadline: number,
  onPage: (orphans: ListedBlob[]) => Promise<void>,
): Promise<boolean> {
  const live = cachedIsLive(isLive);
  let cursor: string | undefined;
  do {
    if (Date.now() >= deadline) return false;
    const page = await list(cursor);
    const orphans: ListedBlob[] = [];
    for (const blob of page.blobs) {
      const shareId = shareIdOf(blob.pathname);
      if (shareId && blob.uploadedAt.getTime() < before && !(await live(shareId))) {
        orphans.push(blob);
      }
    }
    await onPage(orphans);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return true;
}

/** Deletes the orphans `walkOrphanBlobs` finds, `DELETE_BATCH` at a time. */
export async function sweepOrphanBlobs(
  api: BlobLister,
  before: number,
  isLive: IsLive,
  deadline: number,
): Promise<SweepResult> {
  let deleted = 0;
  const done = await walkOrphanBlobs(api.list, before, isLive, deadline, async (orphans) => {
    const urls = orphans.map((blob) => blob.url);
    for (let start = 0; start < urls.length; start += DELETE_BATCH) {
      await api.del(urls.slice(start, start + DELETE_BATCH));
    }
    deleted += urls.length;
  });
  return { deleted, done };
}

/** Counts what `sweepOrphanBlobs` would delete, and deletes nothing: it never has `del`. */
export async function countOrphanBlobs(
  list: ListBlobs,
  before: number,
  isLive: IsLive,
  deadline: number,
): Promise<OrphanScan> {
  let tally = EMPTY_TALLY;
  const done = await walkOrphanBlobs(list, before, isLive, deadline, (orphans) => {
    tally = addToTally(tally, orphans);
    return Promise.resolve();
  });
  return { ...tally, done };
}
