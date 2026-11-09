"use client";

import { motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";

/**
 * "New": came in since the last look at the Overview. On the highlighter, Squint's mark for
 * what deserves a look. Pops in (render it inside `AnimatePresence`).
 */
export function NewMark() {
  const pop = usePopVariants();
  return (
    <motion.span
      variants={pop}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-testid="new-mark"
      className="shrink-0 rounded-pill bg-highlight px-2 py-0.5 text-label font-semibold text-on-highlight"
    >
      New
    </motion.span>
  );
}
