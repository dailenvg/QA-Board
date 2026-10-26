"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { instant, spring } from "@/lib/motion";
import { buttonClass } from "../ui/button-styles";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { SORT_KEYS, SORT_SPECS, type ProjectSort, type SortKey } from "./project-sort";

interface SortControlsProps {
  sort: ProjectSort;
  onKey: (key: SortKey) => void;
  onReverse: () => void;
}

/**
 * What the folder's projects are sorted by (a menu of options), and a button
 * that reverses the order. The button's face is the current order in words
 * ("Newest first", icon-only on phones) and that is its name too, so what you
 * see is what's read out; its tooltip, read as the description, says what a
 * press does ("Reverse order"). An arrow alone doesn't say which end is which.
 */
export function SortControls({ sort, onKey, onReverse }: SortControlsProps) {
  const reduce = useReducedMotion();
  const spec = SORT_SPECS[sort.key];
  const order = spec.order[sort.direction];
  const label = `Sort: ${spec.label}`;
  /** Announces the new order once the person has changed it (not on load). */
  const [changed, setChanged] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Menu
        label={label}
        text={label}
        textClassName="whitespace-nowrap"
        icon="arrowUpDown"
        testId="sort-menu"
        triggerClassName={`${buttonClass("secondary", "sm")} aria-expanded:bg-hover`}
        items={SORT_KEYS.map((key) => ({
          label: SORT_SPECS[key].label,
          checked: key === sort.key,
          onSelect: () => {
            setChanged(true);
            onKey(key);
          },
        }))}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setChanged(true);
          onReverse();
        }}
        aria-label={`Order: ${order}`}
        title="Reverse order"
        data-testid="sort-direction"
        data-direction={sort.direction}
        className="max-sm:size-11 max-sm:px-0"
      >
        {/* Points down for descending, up for ascending. */}
        <motion.span
          className="grid place-items-center"
          initial={false}
          animate={{ rotate: sort.direction === "desc" ? 0 : 180 }}
          transition={reduce ? instant : spring.ui}
        >
          <Icon name="arrowDown" />
        </motion.span>
        <span className="whitespace-nowrap max-sm:hidden">{order}</span>
      </Button>
      <p className="sr-only" aria-live="polite" data-testid="sort-status">
        {changed ? `Sorted by ${spec.label.toLowerCase()}. ${order}` : ""}
      </p>
    </div>
  );
}
