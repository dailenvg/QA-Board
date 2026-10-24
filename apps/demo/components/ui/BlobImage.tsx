"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";

interface BlobImageProps extends Omit<ImageProps, "src" | "unoptimized"> {
  blobKey: string;
  /** Shown while the image loads, or if it isn't in this browser's storage. */
  fallback?: ReactNode;
}

/** A `next/image` whose picture comes from the blob store. */
export function BlobImage({ blobKey, fallback = null, alt, ...props }: BlobImageProps) {
  const image = useBlobUrl(blobKey);
  if (image.status !== "ready") return fallback;
  return <Image src={image.url} alt={alt} unoptimized {...props} />;
}
