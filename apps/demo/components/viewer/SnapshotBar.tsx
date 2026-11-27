"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CAPTURE_PARTIAL_NOTICE } from "@/lib/capture/messages";
import type { CaptureState } from "@/lib/capture/use-capture";
import { duration, instant, useRevealVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Snapshot } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface SnapshotBarProps {
  snapshot: Snapshot;
  isLatest: boolean;
  /** Null when no new snapshot can be taken (image projects). */
  onRefresh: (() => void) | null;
  capture: CaptureState;
  onShowLatest: () => void;
  showLatestLabel: string;
}

/**
 * Floating bar over the snapshot: which snapshot this is, and a way to refresh
 * or go back. Under it, why the last capture failed, or that it only got the
 * top of a long page (said once: it isn't stored).
 */
export function SnapshotBar({
  snapshot,
  isLatest,
  onRefresh,
  capture,
  onShowLatest,
  showLatestLabel,
}: SnapshotBarProps) {
  const now = useNow();
  const variants = useRevealVariants();
  const reduce = useReducedMotion();
  const capturing = capture.status === "capturing";
  // A capture can run 45 s and phones show the icon alone, so it turns while one is working.
  const spinning = capturing && !reduce;
  const refreshLabel = capturing ? "Taking a snapshot…" : "Refresh snapshot";
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="snapshot-bar"
      // The stage's visible width (`--stage-width`, from `StageZoom`; the snapshot's until it's
      // measured) less its margins, stuck to its left edge too: on a snapshot zoomed wider than
      // the stage, the bar stays in view as it scrolls sideways.
      className="sticky top-3 left-3 z-30 mx-3 mt-3 flex w-[calc(var(--stage-width,100%)_-_1.5rem)] flex-col gap-2 sm:left-5 sm:mx-5 sm:mt-5 sm:w-[calc(var(--stage-width,100%)_-_2.5rem)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-panel/95 py-1 pr-1 pl-4 shadow-float ring-1 ring-line backdrop-blur">
        <Icon name={isLatest ? "camera" : "history"} className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-meta text-muted">
          <span className="font-semibold text-ink">
            {isLatest ? "Snapshot" : "Earlier snapshot"}
          </span>
          {" · "}
          <time
            dateTime={new Date(snapshot.createdAt).toISOString()}
            title={absoluteTime(snapshot.createdAt)}
          >
            {relativeTime(snapshot.createdAt, now)}
          </time>
          <span className="max-sm:hidden"> · {snapshot.width}px wide</span>
        </p>
        {isLatest ? null : (
          <Button variant="secondary" size="sm" onClick={onShowLatest}>
            {showLatestLabel}
          </Button>
        )}
        {isLatest && onRefresh ? (
          // aria-disabled, not disabled: a disabled button drops keyboard focus to the page.
          <Button
            variant="ghost"
            size="sm"
            aria-disabled={capturing || undefined}
            // Icon-only on phones; the name is the desktop label either way.
            aria-label={refreshLabel}
            className="max-sm:size-11 max-sm:px-0"
            onClick={capturing ? undefined : onRefresh}
          >
            <motion.span
              className="inline-flex"
              animate={{ rotate: spinning ? 360 : 0 }}
              transition={
                spinning ? { duration: duration.loop, ease: "linear", repeat: Infinity } : instant
              }
            >
              <Icon name="refresh" className="size-4" />
            </motion.span>
            <span className="max-sm:sr-only">{refreshLabel}</span>
          </Button>
        ) : null}
      </div>
      {capture.status === "failed" && isLatest ? (
        // Opaque panel: this floats over the snapshot, so a tint alone can't guarantee contrast.
        <p
          role="alert"
          className="flex items-start gap-2 self-start rounded-field bg-panel px-3 py-2 text-meta font-semibold text-danger shadow-float ring-1 ring-line"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {capture.message}
        </p>
      ) : null}
      {/* initial={false}: arriving with the bar, the bar's own reveal covers it. */}
      <AnimatePresence initial={false}>
        {capture.status === "idle" && capture.partial && isLatest ? (
          // Informational, not an alert: the snapshot worked. The stage's status line reads it out.
          // It fades out as the next capture starts, which is when it stops being true.
          <motion.p
            key="capture-partial"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-testid="capture-partial"
            className="flex items-start gap-2 self-start rounded-field bg-panel px-3 py-2 text-meta text-ink shadow-float ring-1 ring-line"
          >
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-muted" />
            {CAPTURE_PARTIAL_NOTICE}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
