import { useEffect, useState } from "react";
import { getBlob } from "./blob-store";

export type BlobUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  /** Not in this browser's storage (cleared, or saved by another browser). */
  | { status: "missing" };

/** An object URL for a stored blob, revoked when the key changes or the component unmounts. */
export function useBlobUrl(key: string): BlobUrlState {
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void getBlob(key).then((blob) => {
      if (cancelled) return;
      url = blob ? URL.createObjectURL(blob) : null;
      setState({ key, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key]);

  if (state?.key !== key) return { status: "loading" };
  return state.url ? { status: "ready", url: state.url } : { status: "missing" };
}
