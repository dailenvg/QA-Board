"use client";

import { AnimatePresence, motion } from "motion/react";
import { fadeOnly } from "@/lib/motion";

/**
 * A pin's or badge's number, cross-fading in place when it changes: a comment made team only
 * (or shown again) becomes T2, or 5, and later ones move up (D13, R7).
 */
export function PinNumberText({ number }: { number: string }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={number} variants={fadeOnly} initial="hidden" animate="visible" exit="exit">
        {number}
      </motion.span>
    </AnimatePresence>
  );
}
