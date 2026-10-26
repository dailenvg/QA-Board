"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { RESOLVED_GREEN } from "@/lib/brand-palette";
import { instant, spring } from "@/lib/motion";
import { Squiggy } from "../brand/mascot/Squiggy";
import type { Mood } from "../brand/mascot/moods";
import { useRadioGroup } from "../ui/use-radio-group";
import type { CommentTab } from "./types";

interface PanelHeadingProps {
  headingId: string;
  tab: CommentTab;
  onTab: (tab: CommentTab) => void;
  active: number;
  resolved: number;
  celebrating: boolean;
}

interface Segment {
  value: CommentTab;
  label: string;
  count: number;
  mascot: (selected: boolean) => ReactNode;
  testId: string;
}

const MASCOT_SIZE = 40;

/**
 * The open comments' mascot listens while its tab is selected and there's
 * feedback, and celebrates each resolve whether or not its tab is selected.
 */
function activeMood(selected: boolean, active: number, celebrating: boolean): Mood {
  if (celebrating) return "resolved";
  return selected && active > 0 ? "listening" : "idle";
}

/**
 * The comments panel's header: an Active / Resolved switcher with each tab's
 * count and a mascot, under a visually hidden "Comments" heading that names
 * the panel. The selected tab's mascot plays its mood; the other holds its
 * default pose (blinks only), so motion marks the current tab. Mascots are
 * decorative (the toast announces a resolve) and keep their eyes still:
 * avatars tracking every pointer move would pull attention away from the pins.
 */
export function PanelHeading({
  headingId,
  tab,
  onTab,
  active,
  resolved,
  celebrating,
}: PanelHeadingProps) {
  const reduce = useReducedMotion();
  const segments: Segment[] = [
    {
      value: "active",
      label: "Active",
      count: active,
      testId: "tab-active",
      mascot: (selected) => (
        <Squiggy
          mood={activeMood(selected, active, celebrating)}
          size={MASCOT_SIZE}
          followCursor={false}
          still={!selected && !celebrating}
          as="span"
        />
      ),
    },
    {
      value: "resolved",
      label: "Resolved",
      count: resolved,
      testId: "tab-resolved",
      mascot: (selected) => (
        <Squiggy
          mood={selected ? "happy" : "idle"}
          color={RESOLVED_GREEN.hex}
          size={MASCOT_SIZE}
          followCursor={false}
          still={!selected}
          as="span"
        />
      ),
    },
  ];
  const group = useRadioGroup(segments, tab, onTab);

  return (
    <div className="min-w-0 flex-1">
      <h2 id={headingId} className="sr-only">
        Comments
      </h2>
      <div
        role="radiogroup"
        aria-label="Comment status"
        className="flex gap-1 rounded-card bg-seg p-1"
      >
        {segments.map((segment, index) => {
          const selected = segment.value === tab;
          return (
            <button
              key={segment.value}
              ref={group.ref(index)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === group.tabStop ? 0 : -1}
              data-testid={segment.testId}
              onClick={() => onTab(segment.value)}
              onKeyDown={(event) => group.onKeyDown(event, index)}
              className={`relative flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-tile pr-3 pl-1 text-left transition-colors duration-150 ${
                selected
                  ? "text-ink"
                  : "text-muted hover:bg-hover/60 hover:text-ink active:bg-hover"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="comment-tab-thumb"
                  transition={reduce ? instant : spring.snappy}
                  className="absolute inset-0 rounded-tile bg-seg-on shadow-seg"
                />
              ) : null}
              <span aria-hidden="true" className="relative flex shrink-0">
                {segment.mascot(selected)}
              </span>
              <span className="relative flex min-w-0 flex-col">
                <span className="truncate text-meta font-semibold">{segment.label}</span>{" "}
                <span className="text-heading font-bold text-ink tabular-nums">
                  {segment.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
