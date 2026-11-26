"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { PRIORITY_CHIP } from "./priority-tone";

interface PriorityChipProps {
  /** Referenced by the card's or popover's description, so it's read with the comment. */
  id?: string;
  /** Missing for none: no chip. */
  priority: CommentPriority | undefined;
  className?: string;
}

/**
 * A comment's priority as a chip with the flag icon: "Must fix", "Should fix"
 * or "Nit". The page and breakpoint chips' size, so they line up beside it.
 * Screen readers hear "Priority: Must fix". Set or cleared from More, it pops in or out (a fade
 * when motion is reduced); a card or popover that mounts with one shows it at once.
 */
export function PriorityChip({ id, priority, className = "" }: PriorityChipProps) {
  const variants = usePopVariants();
  return (
    <AnimatePresence initial={false}>
      {priority ? (
        <motion.p
          key="priority-chip"
          id={id}
          data-testid="comment-priority"
          data-priority={priority}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-semibold ${PRIORITY_CHIP[priority]} ${className}`}
        >
          <Icon name="flag" className="size-3.5" />
          <span className="sr-only">Priority: </span>
          {PRIORITY_LABEL[priority]}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
