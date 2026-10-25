"use client";

import { useEffect, type ReactNode, type Ref } from "react";
import type { CaptureState } from "@/lib/capture/use-capture";
import { absoluteTime } from "@/lib/relative-time";
import type { Snapshot } from "@/lib/store/types";
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
  /** Captures the current breakpoint, at its fixed width. */
  onCapture: () => void;
  onShowLatest: () => void;
  showLatestLabel: string;
  onScreenshot: ScreenshotHandler | null;
  onBrowse: () => void;
  overlay: ReactNode;
  imageRef: Ref<HTMLImageElement>;
  onReady: () => void;
}

/**
 * What screen readers hear as the stage changes. The first capture announces
 * itself (CaptureProgress); this covers a refresh starting, and a snapshot
 * arriving or being switched to.
 */
function announcement(snapshot: Snapshot | null, isLatest: boolean, capture: CaptureState) {
  if (capture.status === "capturing") return snapshot ? "Taking a new snapshot…" : "";
  if (!snapshot) return "";
  const taken = absoluteTime(snapshot.createdAt);
  return isLatest
    ? `Showing the snapshot taken ${taken}.`
    : `Showing an earlier snapshot, taken ${taken}.`;
}

/**
 * Comment surface for websites: a full-page snapshot in the scrolling canvas,
 * so pins stay on the content. The first visit to each breakpoint captures
 * one at that breakpoint's width, with progress and failure states.
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
  const firstCapture = !snapshot && captureUrl !== null && capture.status === "idle";
  const retake = captureUrl ? onCapture : null;

  useEffect(() => {
    if (firstCapture) onCapture();
  }, [firstCapture, onCapture]);

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
      onRetry={onCapture}
      onScreenshot={onScreenshot}
      onBrowse={onBrowse}
    />
  ) : (
    <CaptureProgress url={captureUrl ?? ""} />
  );

  return (
    <div data-testid="snapshot-stage" className="flex min-h-full flex-col">
      <p role="status" className="sr-only">
        {announcement(snapshot, isLatest, capture)}
      </p>
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
      <div className="flex-1 p-3 sm:p-5">{body}</div>
    </div>
  );
}
