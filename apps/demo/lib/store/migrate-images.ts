import { deleteBlobs, holdBlob, putBlob } from "../blob-store/blob-store";
import { dataUrlToBlob } from "../image";
import type { PendingImage } from "./persist";

export interface ImageStore {
  put: (key: string, blob: Blob) => Promise<boolean>;
  remove: (keys: readonly string[]) => Promise<void>;
  hold: (key: string, blob: Blob) => void;
}

const BLOB_STORE: ImageStore = { put: putBlob, remove: deleteBlobs, hold: holdBlob };

/**
 * Moves version 1 inline images into the blob store, all or nothing. If any
 * write is refused, the ones that landed are removed again and every image is
 * held in memory for this visit, so the caller can keep the old data as it is.
 */
export async function migrateImages(
  images: readonly PendingImage[],
  store: ImageStore = BLOB_STORE,
): Promise<boolean> {
  const blobs = await Promise.all(
    images.map(async ({ key, dataUrl }) => ({ key, blob: await dataUrlToBlob(dataUrl) })),
  );
  const saved = await Promise.all(blobs.map(({ key, blob }) => store.put(key, blob)));
  if (saved.every(Boolean)) return true;
  await store.remove(blobs.filter((_, index) => saved[index]).map(({ key }) => key));
  for (const { key, blob } of blobs) store.hold(key, blob);
  return false;
}
