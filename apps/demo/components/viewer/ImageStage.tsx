"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Skeleton } from "../ui/Skeleton";
import { ScreenshotUpload } from "./ScreenshotUpload";

interface ImageStageProps {
  dataUrl: string;
  projectName: string;
  overlay: ReactNode;
  onReplace: (image: { dataUrl: string; fileName: string }) => string | null;
}

/** Image canvas at its natural aspect ratio (never upscaled); the canvas area scrolls. */
export function ImageStage({ dataUrl, projectName, overlay, onReplace }: ImageStageProps) {
  const [loaded, setLoaded] = useState<{ src: string; width: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = loaded?.src === dataUrl;

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
      <div
        data-testid="canvas"
        className="relative mx-auto w-full"
        style={ready ? { maxWidth: loaded.width } : undefined}
      >
        {ready ? null : <Skeleton className="absolute inset-0 min-h-80" />}
        <Image
          src={dataUrl}
          alt={`${projectName}, the image under review`}
          width={0}
          height={0}
          sizes="100vw"
          unoptimized
          draggable={false}
          onLoad={(event) => setLoaded({ src: dataUrl, width: event.currentTarget.naturalWidth })}
          onError={() => setFailed(dataUrl)}
          className="block h-auto w-full rounded-tile bg-card shadow-float select-none"
        />
        {ready ? overlay : null}
      </div>
    </div>
  );
}
