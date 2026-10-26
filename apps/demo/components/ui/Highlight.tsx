"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

/**
 * A highlighter swash behind a few words of a headline: the lime accent, drawn in left to right.
 * The words stay dark ink in both themes, since light text is unreadable on the lime.
 */
export function Highlight({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative isolate inline-block px-[0.12em] text-on-highlight">
      <motion.span
        aria-hidden="true"
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: duration.page, ease: ease.out, delay: duration.component }}
        style={{ originX: 0, rotate: -1 }}
        className="absolute inset-x-0 top-[0.14em] bottom-[0.04em] -z-10 rounded-[0.3em] bg-highlight"
      />
      {children}
    </span>
  );
}
