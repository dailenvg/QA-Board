"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { duration, ease } from "@/lib/motion";
import { findPage, pagesOf } from "@/lib/store/pages";
import type { CaptureState } from "@/lib/capture/use-capture";
import type { Project, Snapshot } from "@/lib/store/types";
import { ImageStage } from "./ImageStage";
import { SnapshotStage } from "./SnapshotStage";
import type { Surface } from "./surface";
import type { ScreenshotHandler } from "./types";
import { UrlStage } from "./UrlStage";
import type { FrameTarget } from "./use-viewer-surface";

interface ViewerStageProps {
  project: Project;
  surface: Surface;
  latest: Snapshot | null;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  /** An image surface finished loading, so its pins are on screen. */
  onReady: () => void;
  capture: CaptureState;
  onCapture: () => void;
  /** The website page to capture: the one under review. */
  captureUrl: string | null;
  /** The page the live frame shows (websites). */
  frame: FrameTarget | null;
  /** The framed site reported another page of its own. */
  onLocation: ((pageUrl: string) => void) | null;
  /** Width the live site is framed at (tablet and phone breakpoints); null for full width. */
  frameWidth: number | null;
  onShowLatest: () => void;
  onBrowse: () => void;
  onScreenshot: ScreenshotHandler | null;
}

/** "page 2 of 3" on projects with several pages, else null. */
function pageLabel(project: Project, pageId: string): string | null {
  const total = pagesOf(project).length;
  const found = findPage(project, pageId);
  return found && total > 1 ? `page ${found.number} of ${total}` : null;
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
  captureUrl,
  frame,
  onLocation,
  frameWidth,
  onShowLatest,
  onBrowse,
  onScreenshot,
}: ViewerStageProps) {
  const reduce = useReducedMotion();
  const { source } = project;
  const website = source.kind === "url";
  const snapshotStage =
    surface.kind === "snapshot" ? (
      <SnapshotStage
        snapshot={surface.snapshot}
        isLatest={website && surface.snapshot?.id === latest?.id}
        captureUrl={website ? captureUrl : null}
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

  if (source.kind === "pages") {
    if (snapshotStage) return snapshotStage;
    // Each page fades in as it comes on stage, so a page change reads as one.
    return surface.kind === "page" ? (
      <motion.div
        key={surface.page.id}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: duration.component, ease: ease.out }}
      >
        <ImageStage
          blobKey={surface.page.blobKey}
          projectName={project.name}
          pageLabel={pageLabel(project, surface.page.id)}
          overlay={overlay}
          imageRef={imageRef}
          onReady={onReady}
          onReplace={onScreenshot}
        />
      </motion.div>
    ) : null;
  }
  return (
    <>
      <UrlStage
        key={frame?.id}
        url={frame?.url ?? source.url}
        siteUrl={source.url}
        onLocation={onLocation}
        projectName={project.name}
        overlay={surface.kind === "frame" ? overlay : null}
        onScreenshot={onScreenshot}
        commentMode={surface.kind !== "frame"}
        frameWidth={frameWidth}
      />
      {snapshotStage}
    </>
  );
}
