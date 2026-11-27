"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef } from "react";
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
  const box = useRef<HTMLDivElement>(null);
  // After the toast's Undo or Retry, focus comes back to the trigger as the toast leaves
  // (as a card's does), unless it has gone somewhere else since.
  const refocus = useCallback(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const adrift =
        !active || active === document.body || active.closest('[role="status"], [role="alert"]');
      if (adrift) box.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    });
  }, []);
  const change = useStageChange({ onUndo: refocus });
  const pop = usePopVariants();
  const stage = project.stage ?? null;
  return (
    // `contents`: the menu stays the top bar's flex item; the box only finds its trigger.
    <div ref={box} className="contents">
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
    </div>
  );
}
