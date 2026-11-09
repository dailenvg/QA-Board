"use client";

import { motion, useReducedMotion } from "motion/react";
import { duration, ease } from "@/lib/motion";
import { resolvedPercent } from "@/lib/overview/activity";

interface StatusRingProps {
  open: number;
  resolved: number;
}

/** Ring geometry, in viewBox units: a 10-unit stroke on a 100-unit box. */
const RADIUS = 42;
const STROKE = 10;

/**
 * How much of the workspace's feedback is resolved: a green arc over a track
 * of open comments, drawn round once it's on screen (stroke-dashoffset, via
 * `pathLength`), already drawn with reduced motion. Decorative: the counts
 * beside it say the same in words.
 */
export function StatusRing({ open, resolved }: StatusRingProps) {
  const reduce = useReducedMotion();
  const total = open + resolved;
  const share = total === 0 ? 0 : resolved / total;
  return (
    <span aria-hidden="true" className="relative grid size-28 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className={open > 0 ? "stroke-comments" : "stroke-seg"}
        />
        {share > 0 ? (
          <motion.circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap={share < 1 ? "round" : "butt"}
            className="stroke-resolved"
            initial={{ pathLength: reduce ? share : 0 }}
            whileInView={{ pathLength: share }}
            viewport={{ once: true }}
            transition={{ duration: duration.page, ease: ease.out }}
          />
        ) : null}
      </svg>
      <span className="text-title font-bold tabular-nums">
        {resolvedPercent({ open, resolved })}%
      </span>
    </span>
  );
}
