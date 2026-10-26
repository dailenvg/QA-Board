"use client";

import { motion, useReducedMotion } from "motion/react";
import { duration, ease } from "@/lib/motion";

interface SkeletonProps {
  className?: string;
}

/** A `rounded…` class of the caller's, at any breakpoint. */
const HAS_RADIUS = /(?:^|[\s:])rounded(?:-|\s|$)/;

/**
 * Placeholder block that breathes while content loads; static with reduced motion.
 * `rounded-tile` unless `className` sets a radius (the shape of what it stands in for):
 * Tailwind orders same-property classes by name, not by their order here, so both
 * at once would leave `rounded-tile` winning.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={`${HAS_RADIUS.test(className) ? "" : "rounded-tile"} bg-seg ${className}`}
      animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
      transition={
        reduce ? undefined : { duration: duration.loop, ease: ease.breathe, repeat: Infinity }
      }
    />
  );
}
