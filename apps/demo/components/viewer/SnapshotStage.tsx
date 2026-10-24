"use client";

import { useEffect, type ReactNode, type Ref } from "react";
import type { CaptureState } from "@/lib/capture/use-capture";
import type { Snapshot } from "@/lib/store/types";
import { useElementWidth } from "@/lib/use-element-width";
import { CaptureFailed } from "./CaptureFailed";
import { CaptureProgress } from "./CaptureProgress";
import { SnapshotBar } from "./SnapshotBar";
import { SnapshotImage } from "./SnapshotImage";
import type { ScreenshotHandler } from "./types";

interface SnapshotStageProps {
  snapshot: Snapshot | null;
  isLatest: boolean;
  /** The website to capture; null on image projects, which only show older snapshots. */
  captureUrl: string | null;
  capture: CaptureState;
  onCapture: (width: number) => void;
  onShowLatest: () => void;
  showLatestLabel: string;
  onScreenshot: ScreenshotHandler | null;
  onBrowse: () => void;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  onReady: () => void;
}

/**
 * Comment surface for websites: a full-page snapshot in the scrolling canvas,
 * so pins stay on the content. The first visit captures one at the stage's
 * width, with progress and failure states.
 */
export function SnapshotStage({
  snapshot,
  isLatest,
  captureUrl,
  capture,
  onCapture,
  onShowLatest,
  showLatestLabel,
  onScreenshot,
  onBrowse,
  overlay,
  imageRef,
  onReady,
}: SnapshotStageProps) {
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const firstCapture = !snapshot && captureUrl !== null && capture.status === "idle" && width > 0;
  const retake = captureUrl ? () => onCapture(width) : null;

  useEffect(() => {
    if (firstCapture) onCapture(width);
  }, [firstCapture, width, onCapture]);

  const body = snapshot ? (
    <SnapshotImage
      snapshot={snapshot}
      overlay={overlay}
      imageRef={imageRef}
      onReady={onReady}
      onRetake={retake}
    />
  ) : capture.status === "failed" ? (
    <CaptureFailed
      message={capture.message}
      onRetry={() => onCapture(width)}
      onScreenshot={onScreenshot}
      onBrowse={onBrowse}
    />
  ) : (
    <CaptureProgress url={captureUrl ?? ""} />
  );

  return (
    <div data-testid="snapshot-stage" className="flex min-h-full flex-col">
      {snapshot ? (
        <SnapshotBar
          snapshot={snapshot}
          isLatest={isLatest}
          onRefresh={retake}
          capture={capture}
          onShowLatest={onShowLatest}
          showLatestLabel={showLatestLabel}
        />
      ) : null}
      <div ref={measure} className="flex-1 p-3 sm:p-5">
        {body}
      </div>
    </div>
  );
}
