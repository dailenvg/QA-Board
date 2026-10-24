"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { PanelHeading } from "./PanelHeading";

interface CommentsPanelProps {
  docked: boolean;
  sheetOpen: boolean;
  onToggleSheet: () => void;
  active: number;
  resolved: number;
  celebrating: boolean;
  children: ReactNode;
}

/** Right-hand panel on large screens; a collapsible bottom sheet on small ones. */
export function CommentsPanel({
  docked,
  sheetOpen,
  onToggleSheet,
  active,
  resolved,
  celebrating,
  children,
}: CommentsPanelProps) {
  const headingId = useId();
  const bodyId = useId();
  const reduce = useReducedMotion();
  const heading = (
    <PanelHeading
      headingId={headingId}
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
        className="flex min-h-0 w-panel shrink-0 flex-col gap-3 rounded-panel bg-panel pt-4"
      >
        <div className="px-4">{heading}</div>
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
      <button
        type="button"
        aria-expanded={sheetOpen}
        aria-controls={bodyId}
        onClick={onToggleSheet}
        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-t-panel px-4 py-2 transition-colors active:bg-hover"
      >
        {heading}
        <span className="grid size-11 place-items-center rounded-pill bg-card shadow-seg">
          <Icon name={sheetOpen ? "chevronDown" : "chevronUp"} className="size-5" />
          <span className="sr-only">{sheetOpen ? "Hide comments" : "Show comments"}</span>
        </span>
      </button>
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
