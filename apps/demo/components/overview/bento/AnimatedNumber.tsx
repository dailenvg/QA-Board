"use client";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";
import { ease, tally } from "@/lib/motion";

interface AnimatedNumberProps {
  value: number;
  testId?: string;
}

/**
 * A count that ticks up from 0 the first time it's on screen (its tile is
 * still rising in then), and on to any new value after. Server and first
 * render show the value itself; reduced motion only ever shows the value.
 */
export function AnimatedNumber({ value, testId }: AnimatedNumberProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const count = useMotionValue(value);
  const shown = useTransform(count, (latest) => Math.round(latest));
  const counted = useRef(false);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      count.set(value);
      return;
    }
    const from = counted.current ? count.get() : 0;
    counted.current = true;
    const controls = animate(count, value, { from, duration: tally, ease: ease.out });
    return () => controls.stop();
  }, [inView, reduce, value, count]);

  return (
    <motion.span ref={ref} data-testid={testId} className="tabular-nums">
      {shown}
    </motion.span>
  );
}
