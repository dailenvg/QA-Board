"use client";

import type { ReactNode, Ref } from "react";
import type { CaptureState } from "@/lib/capture/use-capture";
import type { Project, Snapshot } from "@/lib/store/types";
import { ImageStage } from "./ImageStage";
import { SnapshotStage } from "./SnapshotStage";
import type { Surface } from "./surface";
import { UrlStage } from "./UrlStage";

type ScreenshotHandler = (image: { dataUrl: string; fileName: string }) => string | null;

interface ViewerStageProps {
  project: Project;
  surface: Surface;
  latest: Snapshot | null;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  /** An image surface finished loading, so its pins are on screen. */
  onReady: () => void;
  capture: CaptureState;
  onCapture: (width: number) => void;
  onShowLatest: () => void;
  onBrowse: () => void;
  onScreenshot: ScreenshotHandler;
}

/**
 * The canvas for the current surface. A website's live frame stays mounted
 * under its snapshot, so going back to Browse doesn't reload the site.
 */
export function ViewerStage({
  project,
  surface,
  latest,
  overlay,
  imageRef,
  onReady,
  capture,
  onCapture,
  onShowLatest,
  onBrowse,
  onScreenshot,
}: ViewerStageProps) {
  const { source } = project;
  const website = source.kind === "url";
  const snapshotStage =
    surface.kind === "snapshot" ? (
      <SnapshotStage
        snapshot={surface.snapshot}
        isLatest={website && surface.snapshot?.id === latest?.id}
        captureUrl={website ? source.url : null}
        capture={capture}
        onCapture={onCapture}
        onShowLatest={onShowLatest}
        showLatestLabel={website ? "Back to latest" : "Back to image"}
        onScreenshot={onScreenshot}
        onBrowse={onBrowse}
        overlay={overlay}
        imageRef={imageRef}
        onReady={onReady}
      />
    ) : null;

  if (source.kind === "image") {
    return (
      snapshotStage ?? (
        <ImageStage
          dataUrl={source.dataUrl}
          projectName={project.name}
          overlay={overlay}
          imageRef={imageRef}
          onReady={onReady}
          onReplace={onScreenshot}
        />
      )
    );
  }
  return (
    <>
      <UrlStage
        url={source.url}
        projectName={project.name}
        overlay={surface.kind === "frame" ? overlay : null}
        onScreenshot={onScreenshot}
        commentMode={surface.kind !== "frame"}
      />
      {snapshotStage}
    </>
  );
}
