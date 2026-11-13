"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef, type KeyboardEvent } from "react";
import { instant, spring } from "@/lib/motion";

export type ShareTab = "invite" | "settings";

export const SHARE_TABS: ReadonlyArray<{ value: ShareTab; label: string }> = [
  { value: "invite", label: "Invite" },
  { value: "settings", label: "Settings" },
];

interface ShareTabsProps {
  value: ShareTab;
  onChange: (tab: ShareTab) => void;
  /** Each tab's panel id: `${panelIdPrefix}-${tab}`. */
  panelIdPrefix: string;
}

export const tabId = (prefix: string, tab: ShareTab) => `${prefix}-tab-${tab}`;
export const panelId = (prefix: string, tab: ShareTab) => `${prefix}-panel-${tab}`;

/**
 * The Share window's tabs on a phone: Invite and Settings. One Tab stop;
 * arrows, Home and End move and select. The raised thumb glides with `layoutId`.
 */
export function ShareTabs({ value, onChange, panelIdPrefix }: ShareTabsProps) {
  const reduce = useReducedMotion();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = SHARE_TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % SHARE_TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + SHARE_TABS.length) % SHARE_TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    const tab = next === null ? undefined : SHARE_TABS[next];
    if (next === null || !tab) return;
    event.preventDefault();
    onChange(tab.value);
    buttons.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Share window" className="flex rounded-pill bg-seg p-0">
      {SHARE_TABS.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tabId(panelIdPrefix, tab.value)}
            aria-selected={selected}
            aria-controls={panelId(panelIdPrefix, tab.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-testid={`share-tab-${tab.value}`}
            className={`relative flex min-h-11 flex-1 items-center justify-center rounded-pill text-body transition-colors duration-150 focus-visible:-outline-offset-2 ${
              selected
                ? "font-semibold text-ink"
                : // As the segmented control's idle options: an inset wash on hover, deeper on press.
                  "font-medium text-muted before:absolute before:inset-1 before:rounded-pill before:transition-colors before:duration-150 hover:text-ink hover:before:bg-hover/60 active:text-ink active:before:bg-hover"
            }`}
          >
            {selected ? (
              <motion.span
                layoutId="share-tab-thumb"
                transition={reduce ? instant : spring.snappy}
                className="absolute inset-1 rounded-pill bg-seg-on shadow-seg"
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
