import { createContext, useContext } from "react";
import { getBlob, subscribeBlob } from "./blob-store";

/** Where views read images from: this browser's blob store, or a share's image routes. */
export interface BlobSource {
  get(key: string): Promise<Blob | null>;
  /** Calls `listener` when the blob under `key` changes. */
  subscribe(key: string, listener: () => void): () => void;
}

export const LOCAL_BLOBS: BlobSource = { get: getBlob, subscribe: subscribeBlob };

export const BlobSourceContext = createContext<BlobSource>(LOCAL_BLOBS);

export function useBlobSource(): BlobSource {
  return useContext(BlobSourceContext);
}
