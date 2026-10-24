import { deleteBlobs, listBlobs, type BlobEntry } from "../blob-store/blob-store";
import { referencedBlobKeys } from "./snapshots";
import { dispatch, getSnapshot } from "./store";

/**
 * How long a blob nobody points at is kept. Covers every Undo toast (and
 * images saved a moment before the record that points at them).
 */
export const BLOB_GRACE_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Blobs that are no longer referenced and older than the grace period. */
export function staleBlobKeys(
  entries: readonly BlobEntry[],
  referenced: ReadonlySet<string>,
  now: number,
): string[] {
  return entries
    .filter((entry) => !referenced.has(entry.key) && now - entry.createdAt >= BLOB_GRACE_MS)
    .map((entry) => entry.key);
}

async function sweep(): Promise<void> {
  dispatch({ type: "snapshot/prune" });
  const state = getSnapshot();
  // Unreadable data might still be recovered, and its images with it.
  if (state.status !== "ready") return;
  const entries = await listBlobs();
  await deleteBlobs(staleBlobKeys(entries, referencedBlobKeys(state.data), Date.now()));
}

/**
 * Prunes replaced snapshots and deletes unreferenced blobs once the grace
 * period has passed, so an Undo within it still finds its images.
 */
export function scheduleBlobSweep(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void sweep();
  }, BLOB_GRACE_MS);
}
