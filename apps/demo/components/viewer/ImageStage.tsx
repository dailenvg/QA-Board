"use client";

import { useState, type ReactNode, type Ref } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";
import { Skeleton } from "../ui/Skeleton";
import { ScreenshotUpload } from "./ScreenshotUpload";
import { SurfaceImage } from "./SurfaceImage";
import type { ScreenshotHandler } from "./types";

interface ImageStageProps {
  blobKey: string;
  projectName: string;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  onReady: () => void;
  onReplace: ScreenshotHandler;
}

function ImageUnavailable({ onReplace }: { onReplace: ScreenshotHandler }) {
  return (
    <div role="alert" className="grid h-full min-h-80 place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h2 className="text-title font-bold">This image couldn&apos;t be displayed</h2>
        <p className="text-body text-muted">
          It may be damaged, or it was removed from this browser&apos;s storage. Upload it again to
          keep reviewing.
        </p>
        <ScreenshotUpload label="Replace image" onImage={onReplace} />
      </div>
    </div>
  );
}

/** Image canvas at its natural aspect ratio (never upscaled); the canvas area scrolls. */
export function ImageStage({
  blobKey,
  projectName,
  overlay,
  imageRef,
  onReady,
  onReplace,
}: ImageStageProps) {
  const image = useBlobUrl(blobKey);
  const [failed, setFailed] = useState<string | null>(null);

  if (image.status === "loading") {
    return (
      <div role="status" className="p-3 sm:p-5">
        <span className="sr-only">Loading the image…</span>
        <Skeleton className="min-h-80 w-full" />
      </div>
    );
  }
  if (image.status === "missing" || failed === image.url) {
    return <ImageUnavailable onReplace={onReplace} />;
  }
  return (
    <div className="p-3 sm:p-5">
      <SurfaceImage
        src={image.url}
        alt={`${projectName}, the image under review`}
        overlay={overlay}
        imageRef={imageRef}
        onReady={onReady}
        onError={() => setFailed(image.url)}
      />
    </div>
  );
}
