import type { BlobSource } from "../blob-store/blob-source";
import { fetchInRanges } from "../share-client/transfer";

export interface WorkspaceBlobs extends BlobSource {
  /** Shows a just-made image (an upload in progress) without fetching it back. */
  hold(key: string, blob: Blob): void;
  /** Asks again for images that were missing: another tab may have uploaded them since. */
  retryMissing(): void;
}

/** A workspace file's route, by its project and logical key (`page:<id>`…). */
export function workspaceBlobUrl(workspaceId: string, projectId: string, key: string): string {
  return `/api/w/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/blobs/${encodeURIComponent(key)}`;
}

/**
 * A workspace's images, read through its member-only routes by logical key
 * and kept for this visit. `locate` names the project a key belongs to (from
 * the loaded data); a key no project uses reads as missing.
 */
export function createWorkspaceBlobs(
  workspaceId: string,
  locate: (key: string) => string | null,
): WorkspaceBlobs {
  const cache = new Map<string, Promise<Blob | null>>();
  const listeners = new Map<string, Set<() => void>>();
  const missing = new Set<string>();

  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };

  const fetchBlob = async (key: string): Promise<Blob | null> => {
    const projectId = locate(key);
    const fetched = projectId
      ? await fetchInRanges(workspaceBlobUrl(workspaceId, projectId, key))
      : null;
    if (fetched?.ok) return fetched.blob;
    // Treated as missing; a later read tries again.
    cache.delete(key);
    missing.add(key);
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
      missing.delete(key);
      cache.set(key, Promise.resolve(blob));
      notify(key);
    },
    retryMissing() {
      const keys = [...missing];
      missing.clear();
      for (const key of keys) notify(key);
    },
  };
}
