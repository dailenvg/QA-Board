import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { usePopVariants } from "@/lib/motion";
import type { Seats } from "@/lib/workspace/members/seats";
import { Squiggy } from "../brand/mascot/Squiggy";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.invite.full;

interface SeatsFullNoticeProps {
  seats: Seats;
  workspaceName: string;
  /** A send was just refused for want of seats: says first that nothing went. */
  nothingSent: boolean;
  /**
   * It replaced the field just used: its heading takes focus if focus fell to
   * the page with the field. Never on a page load.
   */
  takeFocus: boolean;
}

/**
 * In place of the invite field once every seat is taken (4b.2), in
 * `QuotaAlert`'s style: what it means and what frees a seat, beside a
 * thinking Squiggy. Over the limit (after a restore, or a lowered limit) it
 * says how far over. A status, with a heading so it's found by heading navigation.
 */
export function SeatsFullNotice({
  seats,
  workspaceName,
  nothingSent,
  takeFocus,
}: SeatsFullNoticeProps) {
  const variants = usePopVariants();
  const heading = useRef<HTMLHeadingElement>(null);
  const over = seats.used > seats.limit;

  useEffect(() => {
    // Runs as the notice swaps in: nothing sends while it's up, so `takeFocus` holds still.
    if (takeFocus && document.activeElement === document.body) heading.current?.focus();
  }, [takeFocus]);

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col items-start gap-3 rounded-tile bg-comments-soft p-4 sm:flex-row sm:items-center sm:gap-4"
      data-testid="seats-full"
      data-over={over || undefined}
    >
      <Squiggy mood="thinking" size={72} still className="shrink-0" />
      <div role="status" className="flex min-w-0 flex-col gap-1">
        {nothingSent ? (
          <p className="text-body font-semibold text-comments-text">{COPY.nothingSent}</p>
        ) : null}
        <h3
          ref={heading}
          tabIndex={-1}
          className="text-heading font-semibold text-pretty text-comments-text wrap-anywhere focus:outline-none"
        >
          {over ? COPY.overTitle(workspaceName, seats.used, seats.limit) : COPY.title(seats.limit)}
        </h3>
        <p className="text-body text-pretty text-ink-2">
          {over ? COPY.overBody(seats.limit) : COPY.body}
        </p>
      </div>
    </motion.div>
  );
}
