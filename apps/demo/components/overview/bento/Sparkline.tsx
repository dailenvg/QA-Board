"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { ease, instant, staggerStep, tally } from "@/lib/motion";

interface SparklineProps {
  /** Counts per day, oldest first, today last (`perDay`). */
  days: readonly number[];
  /** What the bars say, for screen readers. */
  label: string;
}

/** Seconds between one bar starting to grow and the next: half a stagger step. */
const STEP = staggerStep / 2;

/**
 * A small bar chart, one bar per day, today's in the brand color. The bars
 * grow up one after another the first time it's on screen, the whole chart
 * done within `tally` (each bar takes what's left after the stagger); with
 * reduced motion they're already there. A day with nothing keeps a stub, so
 * the week still reads as seven days.
 */
export function Sparkline({ days, label }: SparklineProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const most = Math.max(1, ...days);
  const grow = tally - Math.max(0, days.length - 1) * STEP;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      data-testid="sparkline"
      // 32px where the bento fits one screen, leaving the list below a whole row more often.
      className="flex h-10 shrink-0 items-end gap-1.5 bento-fit:h-8"
    >
      {days.map((count, index) => {
        const height = count === 0 ? 0.08 : count / most;
        const today = index === days.length - 1;
        return (
          <motion.span
            key={index}
            data-count={count}
            className={`block h-full flex-1 origin-bottom rounded-kbd ${
              count === 0 ? "bg-seg" : today ? "bg-brand" : "bg-ready"
            }`}
            initial={{ scaleY: reduce ? height : 0 }}
            animate={{ scaleY: inView || reduce ? height : 0 }}
            transition={reduce ? instant : { duration: grow, ease: ease.out, delay: index * STEP }}
          />
        );
      })}
    </div>
  );
}
