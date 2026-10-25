"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { duration, ease, press } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { PanelHeading } from "./PanelHeading";
import type { CommentTab } from "./types";

interface CommentsPanelProps {
  docked: boolean;
  sheetOpen: boolean;
  onSheetOpen: (open: boolean) => void;
  tab: CommentTab;
  onTab: (tab: CommentTab) => void;
  active: number;
  resolved: number;
  celebrating: boolean;
  /** A short line under the sheet's header on phones, visible while collapsed. */
  note?: string;
  children: ReactNode;
}

/**
 * Right-hand panel on large screens; a collapsible bottom sheet on small ones.
 * The Active / Resolved switcher is the header, so it stays in reach while
 * the sheet is collapsed; picking a tab there opens the sheet.
 */
export function CommentsPanel({
  docked,
  sheetOpen,
  onSheetOpen,
  tab,
  onTab,
  active,
  resolved,
  celebrating,
  note,
  children,
}: CommentsPanelProps) {
  const headingId = useId();
  const bodyId = useId();
  const reduce = useReducedMotion();
  const heading = (
    <PanelHeading
      headingId={headingId}
      tab={tab}
      onTab={(next) => {
        onTab(next);
        if (docked) onSheetOpen(true);
      }}
      active={active}
      resolved={resolved}
      celebrating={celebrating}
    />
  );

  if (!docked) {
    return (
      <aside
        aria-labelledby={headingId}
        data-testid="comments-panel"
        className="flex min-h-0 w-panel shrink-0 flex-col gap-3 rounded-panel bg-panel pt-3"
      >
        <div className="px-3">{heading}</div>
        {children}
      </aside>
    );
  }

  return (
    <aside
      aria-labelledby={headingId}
      data-testid="comments-panel"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[78dvh] flex-col rounded-t-panel bg-panel pb-[env(safe-area-inset-bottom)] shadow-pop"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {heading}
        <motion.button
          type="button"
          aria-expanded={sheetOpen}
          // The body only exists while open; never point at a missing id.
          aria-controls={sheetOpen ? bodyId : undefined}
          onClick={() => onSheetOpen(!sheetOpen)}
          {...(reduce ? {} : press)}
          className="grid size-11 shrink-0 place-items-center rounded-pill bg-card shadow-seg transition-colors hover:bg-hover active:bg-hover"
        >
          <Icon name={sheetOpen ? "chevronDown" : "chevronUp"} className="size-5" />
          <span className="sr-only">{sheetOpen ? "Hide comments" : "Show comments"}</span>
        </motion.button>
      </div>
      {note ? (
        <p data-testid="panel-note" className="-mt-1 px-4 pb-3 text-label text-muted">
          {note}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {sheetOpen ? (
          <motion.div
            id={bodyId}
            key="sheet-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : duration.component, ease: ease.out }}
            className="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="flex max-h-[60dvh] min-h-0 flex-col">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}
