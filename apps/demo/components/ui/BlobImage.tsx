"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";

interface BlobImageProps extends Omit<ImageProps, "src" | "unoptimized"> {
  blobKey: string;
  /**
   * Shown if the image isn't in this browser's storage or won't decode; also
   * while it loads, unless `pending` is set.
   */
  fallback?: ReactNode;
  /** Shown while the image is read from storage, such as a skeleton. */
  pending?: ReactNode;
}

/** A `next/image` whose picture comes from the blob store. */
export function BlobImage({
  blobKey,
  fallback = null,
  pending = fallback,
  alt,
  onError,
  ...props
}: BlobImageProps) {
  const image = useBlobUrl(blobKey);
  const [broken, setBroken] = useState<string | null>(null);
  if (image.status === "loading") return pending;
  if (image.status === "missing" || broken === image.url) return fallback;
  return (
    <Image
      src={image.url}
      alt={alt}
      unoptimized
      onError={(event) => {
        setBroken(image.url);
        onError?.(event);
      }}
      {...props}
    />
  );
}
