"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { useRevealVariants } from "@/lib/motion";
import { relativeTime } from "@/lib/relative-time";
import { Icon, type IconName } from "../ui/Icon";
import type { Placement } from "./surface";

function copyFor(
  placement: Placement,
  now: number,
): { icon: IconName; label: string; hint: string } {
  switch (placement.kind) {
    case "live":
      return {
        icon: "globe",
        label: "Live page",
        hint: "Placed on the live site before Squint took snapshots. Its pin shows in Browse mode, over the visible frame, so it may not line up after you scroll.",
      };
    case "earlier":
      return {
        icon: "history",
        label: `Earlier snapshot · ${relativeTime(placement.at, now)}`,
        hint: "Placed on an earlier snapshot. Select the comment to see it there.",
      };
    case "missing":
      return {
        icon: "alert",
        label: "Snapshot unavailable",
        hint: "The snapshot this pin was placed on isn't available anymore.",
      };
  }
}

/**
 * Says where a comment's pin lives when it isn't on the current snapshot. The
 * chip is a disclosure: tapping it shows the explanation, so touch users get it
 * too (no hover title). `relative` lifts it above the card's select overlay.
 */
export function PlacementChip({
  id,
  placement,
  now,
}: {
  id: string;
  placement: Placement;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const variants = useRevealVariants();
  const copy = copyFor(placement, now);
  return (
    <div className="relative mt-1">
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-controls={hintId}
        onClick={() => setOpen((value) => !value)}
        data-testid="placement-chip"
        data-placement={placement.kind}
        className="group/chip -ml-1 inline-flex min-h-11 max-w-full items-center rounded-pill px-1 focus-visible:outline-none"
      >
        <span className="inline-flex max-w-full items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2 transition-colors group-hover/chip:bg-hover group-active/chip:bg-line group-focus-visible/chip:ring-2 group-focus-visible/chip:ring-focus">
          <Icon name={copy.icon} className="size-3.5 shrink-0" />
          <span className="truncate">{copy.label}</span>
          <Icon name={open ? "chevronUp" : "chevronDown"} className="size-3.5 shrink-0" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.p
            key="hint"
            id={hintId}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-testid="placement-hint"
            className="text-meta text-muted"
          >
            {copy.hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
