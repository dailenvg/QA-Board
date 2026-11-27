"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { STAGE_LABEL } from "@/lib/store/stage";
import type { Project } from "@/lib/store/types";
import { StageChip } from "../dashboard/StageChip";
import { stageMenuItems } from "../dashboard/stage-menu-items";
import { useStageChange } from "../dashboard/use-stage-change";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";

/** A 44px target around the 24px chip (the pin pattern), with the ghost trigger's states. */
const TRIGGER =
  "inline-flex min-h-11 shrink-0 items-center rounded-pill px-1 transition-colors hover:bg-hover active:bg-seg aria-expanded:bg-hover";

/** "Set stage" while there's none: a dashed ghost pill, quieter than a stage someone set. */
const SET_STAGE = `inline-flex h-6 items-center gap-1 rounded-pill border border-dashed border-line-strong pl-2 pr-3 text-label font-medium whitespace-nowrap text-ink-2`;

/**
 * The team's stage in the viewer's top bar (U4): the stage chip with a caret, which opens the
 * same Stage choices as a card's Actions menu, or "Set stage" without one. Guests never get it
 * (D3). A change shows at once, with the stage toast's Undo.
 */
export function StageMenu({ project }: { project: Project }) {
  const change = useStageChange();
  const pop = usePopVariants();
  const stage = project.stage ?? null;
  return (
    <Menu
      label={stage ? `Stage: ${STAGE_LABEL[stage]}, change stage` : "Set stage"}
      testId="stage-menu"
      triggerClassName={TRIGGER}
      items={stageMenuItems(stage, (next) => change(project, next))}
      triggerContent={
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={stage ? "stage" : "none"}
            variants={pop}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="inline-flex items-center gap-1"
          >
            {stage ? (
              <>
                <StageChip stage={stage} />
                <Icon name="chevronDown" className="size-3.5 text-ink-2" />
              </>
            ) : (
              <span className={SET_STAGE}>
                <Icon name="plus" className="size-4 shrink-0" />
                Set stage
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      }
    />
  );
}
