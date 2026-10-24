import { deleteBlobs, listBlobs, type BlobEntry } from "../blob-store/blob-store";
import { referencedBlobKeys } from "./snapshots";
import { dispatch, getSnapshot } from "./store";

/**
 * How long a blob nobody points at is kept. Covers every Undo toast (and
 * images saved a moment before the record that points at them).
 */
export const BLOB_GRACE_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Keys a pending Undo still needs, with how many holds each has. */
const holds = new Map<string, number>();

/**
 * Keeps `keys` from being swept while an Undo could bring them back (the
 * toast can stay up indefinitely while hovered or focused). Call the returned
 * release once the Undo is used or gone; it schedules a sweep.
 */
export function holdBlobs(keys: Iterable<string>): () => void {
  const held = [...keys];
  for (const key of held) holds.set(key, (holds.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const key of held) {
      const count = (holds.get(key) ?? 1) - 1;
      if (count > 0) holds.set(key, count);
      else holds.delete(key);
    }
    scheduleBlobSweep();
  };
}

export function heldBlobKeys(): ReadonlySet<string> {
  return new Set(holds.keys());
}

/** Blobs nothing references or holds for an Undo, older than the grace period. */
export function staleBlobKeys(
  entries: readonly BlobEntry[],
  referenced: ReadonlySet<string>,
  now: number,
  held: ReadonlySet<string> = heldBlobKeys(),
): string[] {
  return entries
    .filter(
      (entry) =>
        !referenced.has(entry.key) &&
        !held.has(entry.key) &&
        now - entry.createdAt >= BLOB_GRACE_MS,
    )
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
