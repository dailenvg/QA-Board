"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Folder } from "@/lib/store/types";
import { Menu } from "../ui/Menu";
import { SegmentedControl } from "../ui/SegmentedControl";
import { STATUS_FILTER_OPTIONS, type StatusFilterValue } from "./status-filter";

interface DashboardHeaderProps {
  folder: Folder;
  chips: readonly string[];
  filter: StatusFilterValue;
  onFilter: (value: StatusFilterValue) => void;
  canDeleteFolder: boolean;
  onRenameFolder: () => void;
  onDeleteFolder: () => void;
}

/** Folder title with summary chips, folder actions and the status filter. */
export function DashboardHeader({
  folder,
  chips,
  filter,
  onFilter,
  canDeleteFolder,
  onRenameFolder,
  onDeleteFolder,
}: DashboardHeaderProps) {
  return (
    // No horizontal padding: title, filter and project grid share main's content box.
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="truncate text-title font-bold">{folder.name}</h1>
          <Menu
            label="Folder actions"
            testId="folder-menu"
            items={[
              { label: "Rename folder", icon: "pencil", onSelect: onRenameFolder },
              {
                label: canDeleteFolder ? "Delete folder" : "Can't delete your only folder",
                icon: "trash",
                onSelect: onDeleteFolder,
                danger: true,
                disabled: !canDeleteFolder,
              },
            ]}
          />
        </div>
        <ul className="mt-1 flex flex-wrap gap-2" aria-label="Folder summary">
          {chips.map((chip) => (
            <li
              key={chip}
              className="rounded-pill bg-panel px-3 py-1 text-label font-medium text-ink-2"
            >
              {chip}
            </li>
          ))}
        </ul>
      </div>
      <EdgeFadeScroller>
        <SegmentedControl
          label="Filter by status"
          layoutId="status-filter-thumb"
          options={STATUS_FILTER_OPTIONS}
          value={filter}
          onChange={onFilter}
          surface="panel"
        />
      </EdgeFadeScroller>
    </header>
  );
}

const FADE = "1.5rem";

/**
 * Horizontal scroller for the status filter on narrow screens. Edges that hide
 * more options fade out (so a cut-off pill reads as "scroll for more"), options
 * snap into place, and a clicked option scrolls fully into view. When
 * everything fits, nothing fades and nothing scrolls.
 */
function EdgeFadeScroller({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const start = node.scrollLeft > 1;
    const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    setEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    // Fires once on observe, then whenever the scroller or the control changes size.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  const left = edges.start ? `transparent, black ${FADE}` : "black, black";
  const right = edges.end ? `black calc(100% - ${FADE}), transparent` : "black, black";
  const mask = `linear-gradient(to right, ${left}, ${right})`;

  return (
    <div
      ref={scroller}
      onScroll={measure}
      onClick={(event) => {
        const option =
          event.target instanceof Element ? event.target.closest('[role="radio"]') : null;
        option?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: reduce ? "auto" : "smooth",
        });
      }}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      // p-1/-m-1 keeps focus rings inside the scroll box without shifting the layout.
      className="-m-1 max-w-[calc(100%+0.5rem)] snap-x snap-proximity scroll-px-1 overflow-x-auto p-1 [&_[role=radio]]:snap-start"
    >
      {children}
    </div>
  );
}
