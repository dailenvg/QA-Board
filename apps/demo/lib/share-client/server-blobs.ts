import type { BlobSource } from "../blob-store/blob-source";
import { clientApi } from "./api";
import { fetchInRanges } from "./transfer";

export interface ServerBlobs extends BlobSource {
  /** Shows a just-made image (a crop being posted) before the server has it. */
  hold(key: string, blob: Blob): void;
}

/** A shared link's images, read through its token-gated routes and kept for this visit. */
export function createServerBlobs(token: string): ServerBlobs {
  const api = clientApi(token);
  const cache = new Map<string, Promise<Blob | null>>();
  const listeners = new Map<string, Set<() => void>>();

  const fetchBlob = async (key: string): Promise<Blob | null> => {
    const blob = await fetchInRanges(api.blobUrl(key));
    // Treated as missing; a later read tries again.
    if (!blob) cache.delete(key);
    return blob;
  };

  return {
    get(key) {
      let found = cache.get(key);
      if (!found) {
        found = fetchBlob(key);
        cache.set(key, found);
      }
      return found;
    },
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    hold(key, blob) {
      cache.set(key, Promise.resolve(blob));
      for (const listener of listeners.get(key) ?? []) listener();
    },
  };
}
