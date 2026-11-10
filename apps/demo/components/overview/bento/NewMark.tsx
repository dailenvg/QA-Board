"use client";

import { motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { HIGHLIGHT_TAG } from "../../ui/highlight-tag";

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
      className={HIGHLIGHT_TAG}
    >
      New
    </motion.span>
  );
}
