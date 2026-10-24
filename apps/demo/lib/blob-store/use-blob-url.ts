import { useEffect, useState } from "react";
import { getBlob, subscribeBlob } from "./blob-store";

export type BlobUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  /** Not in this browser's storage (cleared, or saved by another browser). */
  | { status: "missing" };

/**
 * An object URL for a stored blob. It follows the blob: saving a new one
 * under the same key (a replaced image) swaps the URL. URLs are revoked when
 * replaced and on unmount.
 */
export function useBlobUrl(key: string): BlobUrlState {
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    let read = 0;
    const load = () => {
      read += 1;
      const current = read;
      void getBlob(key).then((blob) => {
        if (cancelled || current !== read) return;
        if (url) URL.revokeObjectURL(url);
        url = blob ? URL.createObjectURL(blob) : null;
        setState({ key, url });
      });
    };
    load();
    const unsubscribe = subscribeBlob(key, load);
    return () => {
      cancelled = true;
      unsubscribe();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);

  if (state?.key !== key) return { status: "loading" };
  return state.url ? { status: "ready", url: state.url } : { status: "missing" };
}
