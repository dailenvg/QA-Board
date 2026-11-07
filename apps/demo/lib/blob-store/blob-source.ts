import { createContext, useContext } from "react";

/** Where views read images from: the signed-in workspace's routes, or a share's. */
export interface BlobSource {
  get(key: string): Promise<Blob | null>;
  /** Calls `listener` when the blob under `key` changes. */
  subscribe(key: string, listener: () => void): () => void;
}

export const BlobSourceContext = createContext<BlobSource | null>(null);

export function useBlobSource(): BlobSource {
  const source = useContext(BlobSourceContext);
  if (!source) throw new Error("Images read without a blob source.");
  return source;
}
