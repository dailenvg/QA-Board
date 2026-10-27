"use client";

import { useState, type ReactNode } from "react";
import { useFrameCheck, type FrameCheckState } from "@/lib/frame-check/use-frame-check";
import { Skeleton } from "../ui/Skeleton";
import { FrameFallback } from "./FrameFallback";
import { FrameView } from "./FrameView";
import type { ScreenshotHandler } from "./types";

interface UrlStageProps {
  /** The page to frame. */
  url: string;
  /** The project's address: the frame follows the site only on its origin. */
  siteUrl: string;
  onLocation: ((pageUrl: string) => void) | null;
  projectName: string;
  overlay: ReactNode;
  onScreenshot: ScreenshotHandler | null;
  /** In Comment mode the snapshot covers this stage, and the framed site leaves the tab order. */
  commentMode: boolean;
  /** Frames the site at a device width (centered, never wider than the stage); null fills it. */
  frameWidth: number | null;
}

type Decision = "checking" | "load" | "blocked" | "unreachable";

function decide(check: FrameCheckState, forced: boolean): Decision {
  if (check.status === "checking") return "checking";
  const { verdict } = check.result;
  if (verdict === "blocked") return "blocked";
  if (verdict === "unreachable" && !forced) return "unreachable";
  // Embeddable, or the server couldn't tell (private address, failed check): let the browser try.
  return "load";
}

/**
 * Live website canvas for Browse mode. Asks /api/frame-check first; refusals
 * and dead hosts get a fallback with a screenshot upload, everything else
 * loads in the iframe. Only older pins (from before snapshots) are drawn
 * here, on the visible frame, since a cross-origin page's scroll can't be read.
 */
export function UrlStage({
  url,
  siteUrl,
  onLocation,
  projectName,
  overlay,
  onScreenshot,
  commentMode,
  frameWidth,
}: UrlStageProps) {
  const [attempt, setAttempt] = useState(0);
  const [forced, setForced] = useState(false);
  const decision = decide(useFrameCheck(url, attempt), forced);

  return (
    <div
      data-testid="canvas"
      hidden={commentMode}
      data-frame-width={frameWidth ?? undefined}
      style={frameWidth ? { maxWidth: frameWidth } : undefined}
      className={`relative mx-auto h-full min-h-80 w-full overflow-hidden rounded-panel ${
        frameWidth ? "shadow-float ring-1 ring-line" : ""
      }`}
    >
      {decision === "checking" ? (
        <div role="status" className="absolute inset-0 flex flex-col gap-3 bg-card p-6">
          <span className="sr-only">Checking whether the site can be shown here…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : null}
      {decision === "load" ? (
        <FrameView
          key={attempt}
          url={url}
          title={`Preview of ${projectName}`}
          overlay={overlay}
          onScreenshot={onScreenshot}
          commentMode={commentMode}
          siteUrl={siteUrl}
          onLocation={onLocation}
        />
      ) : null}
      {decision === "blocked" || decision === "unreachable" ? (
        <FrameFallback
          reason={decision}
          url={url}
          onScreenshot={onScreenshot}
          onRetry={
            decision === "blocked" ? () => setAttempt((value) => value + 1) : () => setForced(true)
          }
        />
      ) : null}
    </div>
  );
}
