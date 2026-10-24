"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFrameCheck, type FrameCheckState } from "@/lib/frame-check/use-frame-check";
import { Skeleton } from "../ui/Skeleton";
import { FrameFallback } from "./FrameFallback";
import { FrameView } from "./FrameView";

interface UrlStageProps {
  url: string;
  projectName: string;
  overlay: ReactNode;
  onScreenshot: (image: { dataUrl: string; fileName: string }) => string | null;
  /** Whether the live frame, and so the comment overlay, is on screen (not checking or a fallback). */
  onCommentableChange: (commentable: boolean) => void;
  commentMode: boolean;
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
 * Website canvas. Asks /api/frame-check first; refusals and dead hosts get a
 * fallback with a screenshot upload, everything else loads in the iframe.
 * Pins are positioned on the visible frame, since a cross-origin page's scroll can't be read.
 */
export function UrlStage({
  url,
  projectName,
  overlay,
  onScreenshot,
  onCommentableChange,
  commentMode,
}: UrlStageProps) {
  const [attempt, setAttempt] = useState(0);
  const [forced, setForced] = useState(false);
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const decision = decide(useFrameCheck(url, attempt), forced);
  const commentable = decision === "load" && timedOutAttempt !== attempt;

  useEffect(() => {
    onCommentableChange(commentable);
  }, [commentable, onCommentableChange]);

  return (
    <div
      data-testid="canvas"
      className="relative h-full min-h-80 w-full overflow-hidden rounded-panel"
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
          onTimeoutChange={(timedOut) => setTimedOutAttempt(timedOut ? attempt : null)}
          commentMode={commentMode}
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
