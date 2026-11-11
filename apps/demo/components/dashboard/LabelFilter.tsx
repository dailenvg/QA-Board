"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { buttonClass } from "../ui/button-styles";
import { Menu } from "../ui/Menu";

interface LabelFilterProps {
  /** The labels to choose from, A to Z. With none, the filter isn't shown. */
  labels: readonly string[];
  /** The chosen label; null shows projects with any label or none. */
  value: string | null;
  onChange: (label: string | null) => void;
}

const ANY = "All labels";

/**
 * Beside the status filter (folder pages and Folders): a menu of the labels in use, one of
 * which narrows the list to its projects. It fades in once there's a label to pick, and out
 * once there's none. The trigger names the choice, so what you see is what's read out.
 */
export function LabelFilter({ labels, value, onChange }: LabelFilterProps) {
  const variants = useRevealVariants();
  const text = `Label: ${value ?? ANY}`;
  return (
    <AnimatePresence initial={false}>
      {labels.length > 0 ? (
        <motion.div
          key="label-filter"
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
            icon="tag"
            testId="label-filter"
            triggerClassName={`${buttonClass("secondary", "sm")} max-w-full aria-expanded:bg-hover`}
            items={[
              { id: "any", label: ANY, checked: value === null, onSelect: () => onChange(null) },
              ...labels.map((label) => ({
                id: `label:${label}`,
                label,
                checked: label === value,
                onSelect: () => onChange(label),
              })),
            ]}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
