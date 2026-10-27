"use client";

import { AnimatePresence, motion } from "motion/react";
import { fadeOnly } from "@/lib/motion";
import { shortTimeLeft, spokenTimeLeft, type TimeLeft } from "@/lib/share/review-window";
import { Icon } from "../ui/Icon";

interface ReviewCountdownProps {
  /** Null once the review window has closed. */
  left: TimeLeft | null;
}

/**
 * Open: the brand lime under ink (15.7:1, the same in both themes), so the
 * deadline stands out in the bar. The last day turns to the solid danger fill
 * (6.3:1 light, 7.7:1 dark), and the wording drops to hours. Closed is neutral.
 */
const TONE = {
  open: "bg-highlight text-on-highlight",
  lastDay: "bg-danger text-card",
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
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-4 text-body font-semibold whitespace-nowrap tabular-nums transition-colors duration-150 ${tone}`}
        >
          <Icon name="clock" className="size-5" />
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
