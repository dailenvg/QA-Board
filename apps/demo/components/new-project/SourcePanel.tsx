"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

interface SourcePanelProps {
  /** The source shown; the others stay laid out, invisible and inert, holding the height. */
  active: boolean;
  testId: string;
  children: ReactNode;
}

/**
 * One source's fields (website, images, PDF) in the New project form. Every panel sits in the
 * same cell of one grid, so the cell, and the dialog, is as tall as the tallest
 * panel whichever source is chosen: switching sources never resizes it. The chosen panel fades
 * in; the others fade out, then hide (visibility, so they're skipped by readers too) and go
 * inert, so nothing in them can be focused or clicked. Reduced motion swaps them at once.
 */
export function SourcePanel({ active, testId, children }: SourcePanelProps) {
  const reduce = useReducedMotion();
  const transition = { duration: reduce ? 0 : duration.micro, ease: ease.out };
  return (
    <motion.div
      initial={false}
      animate={
        active
          ? { opacity: 1, visibility: "visible", transition }
          : { opacity: 0, transitionEnd: { visibility: "hidden" }, transition }
      }
      inert={!active}
      data-testid={testId}
      data-active={active || undefined}
      className="col-start-1 row-start-1 min-w-0"
    >
      {children}
    </motion.div>
  );
}
