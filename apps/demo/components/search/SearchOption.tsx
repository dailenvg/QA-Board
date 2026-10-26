"use client";

import { motion, useReducedMotion } from "motion/react";
import { instant, spring } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { HighlightedName } from "./HighlightedName";
import type { SearchEntry } from "./search-entries";

interface SearchOptionProps {
  id: string;
  entry: SearchEntry;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}

/**
 * One result in the listbox. Focus stays in the search field (aria-activedescendant), so the
 * option is never focused itself; the active one gets a tint that glides between rows.
 */
export function SearchOption({ id, entry, active, onHover, onChoose }: SearchOptionProps) {
  const reduce = useReducedMotion();
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-testid="search-option"
      onMouseMove={active ? undefined : onHover}
      onClick={onChoose}
      className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-row px-3 py-2"
    >
      {active ? (
        <motion.span
          layoutId="search-active-option"
          transition={reduce ? instant : spring.snappy}
          aria-hidden="true"
          className="absolute inset-0 rounded-row bg-brand-soft"
        />
      ) : null}
      <span className="relative grid size-8 shrink-0 place-items-center rounded-pill bg-tile text-ink-2">
        <Icon name={entry.icon} className="size-4" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-ink">
          <HighlightedName name={entry.name} match={entry.match} />
        </span>
        <span className="block truncate text-meta text-muted">{entry.where}</span>
        <span className="sr-only">, {entry.type}</span>
      </span>
      {active ? (
        <Icon name="chevronRight" className="relative size-4 shrink-0 text-brand-text" />
      ) : null}
    </div>
  );
}
