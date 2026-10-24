import type { BlobSource } from "../blob-store/blob-source";
import { clientApi } from "./api";

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
    try {
      const response = await fetch(api.blobUrl(key), { cache: "no-store" });
      if (response.ok) return await response.blob();
    } catch {
      // Treated as missing; a later read tries again.
    }
    cache.delete(key);
    return null;
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
