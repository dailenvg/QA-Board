"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SegmentedControl } from "../ui/SegmentedControl";
import { STATUS_FILTER_OPTIONS, type StatusFilterValue } from "./status-filter";

interface StatusFilterProps {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
}

/**
 * The status filter (All, Ready to review, Comments in, Comments resolved) on folder pages and
 * Folders: one segmented control whose thumb glides between options, scrolling across the full
 * width on narrow screens.
 */
export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <EdgeFadeScroller>
      <SegmentedControl
        label="Filter by status"
        layoutId="status-filter-thumb"
        options={STATUS_FILTER_OPTIONS}
        value={value}
        onChange={onChange}
        surface="panel"
      />
    </EdgeFadeScroller>
  );
}

/**
 * Puts focus on the status filter's chosen option: for "Show all" in an empty filter result,
 * whose button goes away with the empty state (focus would fall to the page's top). Waits a
 * frame, so the filter shows its new choice first.
 */
export function focusStatusFilter(): void {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(
        '[role="radiogroup"][aria-label="Filter by status"] [role="radio"][aria-checked="true"]',
      )
      ?.focus();
  });
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
