"use client";

import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";
import { CAPTURE_PARTIAL_NOTICE } from "@/lib/capture/messages";
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
 * arriving or being switched to, with the partial-page notice when it applies.
 */
function announcement(snapshot: Snapshot | null, isLatest: boolean, capture: CaptureState) {
  if (capture.status === "capturing") return snapshot ? "Taking a new snapshot…" : "";
  if (!snapshot) return "";
  const taken = absoluteTime(snapshot.createdAt);
  if (!isLatest) return `Showing an earlier snapshot, taken ${taken}.`;
  const partial = capture.status === "idle" && capture.partial;
  return `Showing the snapshot taken ${taken}.${partial ? ` ${CAPTURE_PARTIAL_NOTICE}` : ""}`;
}

/**
 * Comment surface for websites: a full-page snapshot in the scrolling canvas,
 * so pins stay on the content. The first visit to each breakpoint captures
 * one at that breakpoint's width, with progress and failure states. A
 * capture that lands on a login page saves nothing, so there's no canvas to pin on.
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
  const bodyRef = useRef<HTMLDivElement>(null);

  // Retry unmounts its own button as the progress takes its place. Park focus
  // on the stage so it isn't dropped to the page: if the capture fails again,
  // the next Tab lands on the failure's buttons rather than the top of the page.
  const retry = useCallback(() => {
    bodyRef.current?.focus({ preventScroll: true });
    onCapture();
  }, [onCapture]);

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
      loginPage={capture.failure === "login-page"}
      onRetry={retry}
      onScreenshot={onScreenshot}
      onBrowse={onBrowse}
    />
  ) : (
    <CaptureProgress url={captureUrl ?? ""} />
  );

  return (
    // As wide as a zoomed snapshot, so its padding scrolls with it and the bar can stay in view.
    <div data-testid="snapshot-stage" className="flex min-h-full w-fit min-w-full flex-col">
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
      {/* Focusable only without a snapshot (see `retry`), so clicks on the canvas never move focus here. */}
      <div
        ref={bodyRef}
        tabIndex={snapshot ? undefined : -1}
        // With a snapshot, room at the bottom for the zoom control (as on an image's stage).
        className={`flex-1 px-3 pt-3 focus:outline-none sm:px-5 sm:pt-5 ${snapshot ? "pb-16 sm:pb-18" : "pb-3 sm:pb-5"}`}
      >
        {body}
      </div>
    </div>
  );
}
