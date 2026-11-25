"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useSwapVariants } from "@/lib/motion";

interface ReplySlotProps {
  /** The reply box, where it shows (`showsReplyBox`); null where it doesn't. */
  box: ReactNode;
  /** Why there's no box (`replyClosedNote`), said in its place; null to say nothing. */
  note: string | null;
}

/**
 * Where a thread's reply box goes, under a card's thread or the pin's
 * popover. A guest who can't reply there reads why instead (the window
 * closed, or the team resolved the comment), and one swaps for the other in
 * place when that changes while it's open.
 */
export function ReplySlot({ box, note }: ReplySlotProps) {
  const swap = useSwapVariants();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {box ? (
        <motion.div key="box" variants={swap} initial="hidden" animate="visible" exit="exit">
          {box}
        </motion.div>
      ) : note ? (
        <motion.p
          key="note"
          variants={swap}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-testid="reply-closed-note"
          className="text-label text-muted"
        >
          {note}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
