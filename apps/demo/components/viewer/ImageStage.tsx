"use client";

import { useState, type ReactNode, type Ref } from "react";
import { ScreenshotUpload } from "./ScreenshotUpload";
import { SurfaceImage } from "./SurfaceImage";

interface ImageStageProps {
  dataUrl: string;
  projectName: string;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  onReady: () => void;
  onReplace: (image: { dataUrl: string; fileName: string }) => string | null;
}

/** Image canvas at its natural aspect ratio (never upscaled); the canvas area scrolls. */
export function ImageStage({
  dataUrl,
  projectName,
  overlay,
  imageRef,
  onReady,
  onReplace,
}: ImageStageProps) {
  const [failed, setFailed] = useState<string | null>(null);

  if (failed === dataUrl) {
    return (
      <div role="alert" className="grid h-full min-h-80 place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <h2 className="text-title font-bold">This image couldn&apos;t be displayed</h2>
          <p className="text-body text-muted">
            The saved file may be damaged. Upload it again to keep reviewing.
          </p>
          <ScreenshotUpload label="Replace image" onImage={onReplace} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5">
      <SurfaceImage
        src={dataUrl}
        alt={`${projectName}, the image under review`}
        overlay={overlay}
        imageRef={imageRef}
        onReady={onReady}
        onError={() => setFailed(dataUrl)}
      />
    </div>
  );
}
