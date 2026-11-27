"use client";

import { AnimatePresence, motion } from "motion/react";
import { fadeOnly } from "@/lib/motion";
import { STAGE_LABEL } from "@/lib/store/stage";
import type { ProjectStage } from "@/lib/store/types";
import { Icon, type IconName } from "../ui/Icon";
import { BADGE_SHELL, NEUTRAL_BADGE } from "../ui/StatusChip";

/** One icon per stage, shared by the chip wherever it shows (U2). */
export const STAGE_ICON: Record<ProjectStage, IconName> = {
  "open-for-review": "send",
  editing: "pencil",
  "on-hold": "hourglass",
  approved: "sealCheck",
};

/**
 * A project's stage as an outlined neutral pin with its icon (U1): the solid fill is the status
 * Squint derives, the outline what a person set. No color per stage, so Approved never reads as
 * the resolved green. A new stage swaps its icon and word in place.
 */
export function StageChip({ stage }: { stage: ProjectStage }) {
  return (
    <span
      data-testid="stage-chip"
      data-stage={stage}
      className={`${BADGE_SHELL} shrink-0 font-medium ${NEUTRAL_BADGE}`}
    >
      <span className="sr-only">Stage: </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={stage}
          variants={fadeOnly}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="inline-flex items-center gap-1"
        >
          <Icon name={STAGE_ICON[stage]} className="size-4 shrink-0" />
          {STAGE_LABEL[stage]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
