"use client";

import { useState, type ReactNode, type Ref } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";
import { absoluteTime } from "@/lib/relative-time";
import type { Snapshot } from "@/lib/store/types";
import { displayHost } from "@/lib/url";
import { Skeleton } from "../ui/Skeleton";
import { SnapshotMissing } from "./SnapshotMissing";
import { SurfaceImage } from "./SurfaceImage";

interface SnapshotImageProps {
  snapshot: Snapshot;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  onReady: () => void;
  /** Takes a new snapshot when this one can't be shown; null where that isn't possible. */
  onRetake: (() => void) | null;
}

/** A stored snapshot, read from the blob store, with the pins layer over it. */
export function SnapshotImage({
  snapshot,
  overlay,
  imageRef,
  onReady,
  onRetake,
}: SnapshotImageProps) {
  const image = useBlobUrl(snapshot.blobKey);
  const [broken, setBroken] = useState<string | null>(null);

  if (image.status === "loading") {
    return (
      <div
        role="status"
        className="mx-auto w-full"
        style={{ maxWidth: snapshot.width, aspectRatio: `${snapshot.width} / ${snapshot.height}` }}
      >
        <span className="sr-only">Loading the snapshot…</span>
        <Skeleton className="size-full" />
      </div>
    );
  }
  if (image.status === "missing" || broken === image.url)
    return <SnapshotMissing onRetake={onRetake} />;
  return (
    <SurfaceImage
      src={image.url}
      alt={`Snapshot of ${displayHost(snapshot.sourceUrl)}, taken ${absoluteTime(snapshot.createdAt)}`}
      size={snapshot}
      overlay={overlay}
      imageRef={imageRef}
      onReady={onReady}
      onError={() => setBroken(image.url)}
    />
  );
}
