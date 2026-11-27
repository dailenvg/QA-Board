"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { PROJECT_STAGES } from "@/lib/store/stage";
import { buttonClass } from "../ui/button-styles";
import { Menu, type MenuItem } from "../ui/Menu";
import { stageFilterLabel, type StageFilterValue } from "./status-filter";

interface StageFilterProps {
  /** Whether any project in scope has a stage. Without one (and none chosen), it isn't shown. */
  inUse: boolean;
  /** The chosen stage, `none` for projects without one, or `all`. */
  value: StageFilterValue;
  onChange: (stage: StageFilterValue) => void;
}

const CHOICES: readonly StageFilterValue[] = ["all", "none", ...PROJECT_STAGES];

/**
 * After the label filter (folder pages and Folders): All stages, No stage, then each stage,
 * narrowing the list together with the status and label. It fades in once a project in scope
 * has a stage, and stays while one is chosen, so the choice can always be undone. The trigger
 * names the choice, so what you see is what's read out.
 */
export function StageFilter({ inUse, value, onChange }: StageFilterProps) {
  const variants = useRevealVariants();
  const text = `Stage: ${stageFilterLabel(value)}`;
  const items: MenuItem[] = CHOICES.map((choice) => ({
    id: `stage:${choice}`,
    label: stageFilterLabel(choice),
    checked: choice === value,
    onSelect: () => onChange(choice),
  }));
  return (
    <AnimatePresence initial={false}>
      {inUse || value !== "all" ? (
        <motion.div
          key="stage-filter"
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="max-w-full min-w-0"
        >
          <Menu
            label={text}
            text={text}
            textClassName="max-w-48 truncate whitespace-nowrap"
            icon="kanban"
            testId="stage-filter"
            triggerClassName={`${buttonClass("secondary", "sm")} max-w-full aria-expanded:bg-hover`}
            items={items}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
