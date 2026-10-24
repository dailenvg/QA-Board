"use client";

import { motion } from "motion/react";
import type { CaptureState } from "@/lib/capture/use-capture";
import { useRevealVariants } from "@/lib/motion";
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

/** Floating bar over the snapshot: which snapshot this is, and a way to refresh or go back. */
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
  const capturing = capture.status === "capturing";
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="snapshot-bar"
      className="sticky top-3 z-30 mx-3 mt-3 flex flex-col gap-2 sm:mx-5 sm:mt-5"
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
            onClick={capturing ? undefined : onRefresh}
          >
            <Icon name="refresh" className="size-4" />
            {capturing ? "Taking snapshot…" : "Refresh snapshot"}
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
    </motion.div>
  );
}
