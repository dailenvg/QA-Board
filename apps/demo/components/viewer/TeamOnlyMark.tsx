"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { TeamOnlyChip } from "../ui/TeamOnlyChip";

interface TeamOnlyMarkProps {
  /** The comment or reply is kept to the team. */
  teamOnly: boolean;
  /**
   * `chip`: a comment's "Team only" chip after its author's name (card and popover). `compact`: a
   * reply's 24px lock, only on a reply kept to the team under a comment clients see; under a
   * team-only comment the comment's chip covers the whole thread (U6).
   */
  kind: "chip" | "compact";
}

/**
 * The team's mark on what clients never see (057), in the Client mark's slot. It pops in and
 * out, so a reply that stays team only when its comment is shown to the client (U20), or a
 * comment made team only, shows the change.
 */
export function TeamOnlyMark({ teamOnly, kind }: TeamOnlyMarkProps) {
  const variants = usePopVariants();
  return (
    <AnimatePresence initial={false}>
      {teamOnly ? (
        <motion.span
          key="team-only"
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="inline-flex shrink-0"
        >
          {kind === "chip" ? (
            <>
              <span className="sr-only">, </span>
              <TeamOnlyChip />
            </>
          ) : (
            <span
              data-testid="reply-team-only"
              title="Team only"
              className="grid size-6 place-items-center rounded-pin bg-inv text-on-inv"
            >
              <Icon name="lock" className="size-3.5" />
              <span className="sr-only">Team only</span>
            </span>
          )}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
