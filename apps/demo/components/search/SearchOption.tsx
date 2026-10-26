"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { instant, spring } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { HighlightedName } from "./HighlightedName";
import type { SearchEntry } from "./search-entries";

interface SearchOptionProps {
  id: string;
  entry: SearchEntry;
  active: boolean;
  onHover: () => void;
  /** A plain click is following the link in this tab: close the search. */
  onChoose: () => void;
}

/** Cmd/Ctrl/Shift/Alt or a non-primary button: the browser opens it elsewhere, the search stays. */
function opensElsewhere(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * One result in the listbox. The option is the link itself (`<a role="option">`, an allowed
 * role for a link), so middle-click, Cmd/Ctrl-click and "Open in new tab" work, with no
 * focusable control nested inside an option. Focus stays in the search field
 * (aria-activedescendant), so the option is never focused (tabIndex -1); the active one gets a
 * tint that glides between rows.
 */
export function SearchOption({ id, entry, active, onHover, onChoose }: SearchOptionProps) {
  const reduce = useReducedMotion();
  return (
    <Link
      id={id}
      href={entry.href}
      // Results change on every keystroke; don't prefetch each set that flashes by.
      prefetch={false}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-testid="search-option"
      onMouseMove={active ? undefined : onHover}
      onClick={(event) => {
        if (!opensElsewhere(event)) onChoose();
      }}
      className="relative flex min-h-11 items-center gap-3 rounded-row px-3 py-2"
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
    </Link>
  );
}
