"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";

interface CommentEditedProps {
  /** Referenced by the comment's `aria-describedby`, so it's read after the text. */
  id: string;
  /** When the comment's words last changed (`Comment.editedAt`); nothing shows without it. */
  editedAt: number | undefined;
  now: number;
  className?: string;
}

/**
 * "Edited 5 minutes ago" under a comment whose words changed after posting:
 * the time is in view, not on hover, and ticks with the card's clock. An
 * edit landing while it's on screen pops the line in. The server stamps the
 * time, so a browser clock running behind it would read "in 1 minute": the
 * words never go past now, while `dateTime` and `title` keep the real time.
 */
export function CommentEdited({ id, editedAt, now, className = "" }: CommentEditedProps) {
  const variants = usePopVariants();
  return (
    <AnimatePresence initial={false}>
      {editedAt ? (
        <motion.p
          key="edited"
          id={id}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-testid="comment-edited"
          className={`text-label text-muted ${className}`}
        >
          Edited{" "}
          <time dateTime={new Date(editedAt).toISOString()} title={absoluteTime(editedAt)}>
            {relativeTime(Math.min(editedAt, now || editedAt), now)}
          </time>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
