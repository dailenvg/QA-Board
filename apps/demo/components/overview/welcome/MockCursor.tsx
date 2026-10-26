"use client";

import { motion, type Variants } from "motion/react";
import { duration, ease, spring } from "@/lib/motion";
import { SCENE_S } from "./story-script";

/** Where the cursor is: `away` waits off to the lower right, `aside` steps off the target. */
export type CursorPose = "away" | "on" | "press" | "aside";

const POSES: Variants = {
  away: { x: 64, y: 48, opacity: 0, scale: 1 },
  on: { x: 0, y: 0, opacity: 1, scale: 1 },
  press: { x: 0, y: 0, opacity: 1, scale: 0.8 },
  aside: { x: 22, y: 18, opacity: 1, scale: 1 },
};

/**
 * Different easings on x and y bend the straight line into a curve: the
 * cursor rises first, then sweeps across, as a hand on a mouse does.
 */
const GLIDE = {
  x: { duration: SCENE_S.glide, ease: ease.breathe },
  y: { duration: SCENE_S.glide, ease: ease.out },
  opacity: { duration: duration.micro },
  scale: spring.snappy,
} as const;

interface MockCursorProps {
  pose: CursorPose;
  /** Where the tip rests in the parent, as position classes. Defaults to its center. */
  anchor?: string;
}

/**
 * A pointer whose tip rests on a point in its parent. Drawn with the pin tokens,
 * which stay the same in both themes, like a real cursor over any page.
 */
export function MockCursor({ pose, anchor = "top-1/2 left-1/2" }: MockCursorProps) {
  return (
    <motion.span
      className={`absolute z-20 block size-5 ${anchor}`}
      style={{ translate: "-15% -10%", originX: 0.15, originY: 0.1 }}
      variants={POSES}
      initial={false}
      animate={pose}
      transition={GLIDE}
    >
      <svg viewBox="0 0 24 24" className="size-full drop-shadow-sm" aria-hidden="true">
        <path
          d="M3.5 2.5v17l4.6-4.4 3 6.6 3.1-1.4-3-6.5h6.3z"
          className="fill-pin-band stroke-pin-halo"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </motion.span>
  );
}
