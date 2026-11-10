"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { ease, instant, tally } from "@/lib/motion";

interface GrowBarProps {
  /** How full, 0 to 1. */
  share: number;
  /** The fill's color class (`bg-…`). */
  fill: string;
  /** The bar's height class. */
  height?: "h-1.5" | "h-2";
  className?: string;
}

/**
 * A thin bar that fills to `share` once it's on screen (the track watches:
 * an empty fill has no size to come into view), and to any new share after.
 * Already full with reduced motion. Decorative: its row says the same in words.
 */
export function GrowBar({ share, fill, height = "h-1.5", className = "" }: GrowBarProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`block ${height} overflow-hidden rounded-pill bg-seg ${className}`}
    >
      <motion.span
        className={`block h-full origin-left rounded-pill ${fill}`}
        initial={{ scaleX: reduce ? share : 0 }}
        animate={{ scaleX: inView || reduce ? share : 0 }}
        transition={reduce ? instant : { duration: tally, ease: ease.out }}
      />
    </span>
  );
}
