"use client";

import { AnimatePresence, motion } from "motion/react";
import { fadeOnly } from "@/lib/motion";
import { shortTimeLeft, spokenTimeLeft, type TimeLeft } from "@/lib/share/review-window";
import { Icon } from "../ui/Icon";

interface ReviewCountdownProps {
  /** Null once the review window has closed. */
  left: TimeLeft | null;
}

/** The last day reads as a warning. */
const TONE = {
  open: "bg-brand-soft text-brand-text",
  lastDay: "bg-comments-soft text-comments-text",
  closed: "bg-seg text-ink",
} as const;

const CLOSED_ANNOUNCEMENT = "The review window has closed. You can still read every comment.";

/**
 * How long the shared link still takes comments, as a chip in the top bar,
 * refreshed every minute. Screen readers get the full wording on the chip, and
 * only the closing is announced, not every tick.
 */
export function ReviewCountdown({ left }: ReviewCountdownProps) {
  const tone = !left ? TONE.closed : left.days === 0 ? TONE.lastDay : TONE.open;
  return (
    <>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={left ? "open" : "closed"}
          variants={fadeOnly}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-testid="review-countdown"
          data-state={left ? "open" : "closed"}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-label font-semibold whitespace-nowrap tabular-nums transition-colors duration-150 ${tone}`}
        >
          <Icon name="clock" className="size-4" />
          {left ? (
            <>
              <span aria-hidden="true">{shortTimeLeft(left)} left</span>
              <span className="sr-only">{spokenTimeLeft(left)} left to comment</span>
            </>
          ) : (
            "Review closed"
          )}
        </motion.span>
      </AnimatePresence>
      <p role="status" className="sr-only">
        {left ? "" : CLOSED_ANNOUNCEMENT}
      </p>
    </>
  );
}
