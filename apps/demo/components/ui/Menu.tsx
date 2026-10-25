"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePopVariants } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  /** Accessible name of the trigger, such as "Project actions". */
  label: string;
  items: readonly MenuItem[];
  className?: string;
  testId?: string;
  /** Trigger icon; `more` (···) by default. */
  icon?: IconName;
  /** Visible trigger text, hidden on phones. Without it the trigger is icon-only. */
  text?: string;
  /** Replaces the default (ghost) trigger styling. */
  triggerClassName?: string;
  /** Unavailable right now: the trigger stays focusable and explains why. */
  disabledReason?: string | null;
  /**
   * -1 keeps the trigger out of the Tab order, for menus inside a widget with
   * its own keyboard model (a tree row); its actions must be reachable elsewhere.
   */
  triggerTabIndex?: number;
}

const TRIGGER_CLASS =
  "grid size-11 place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg aria-expanded:bg-hover aria-expanded:text-ink";

/** Overflow menu: arrow keys move, Escape closes and returns focus to the trigger. */
export function Menu({
  label,
  items,
  className = "",
  testId,
  icon = "more",
  text,
  triggerClassName = TRIGGER_CLASS,
  disabledReason = null,
  triggerTabIndex,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  /** A disabled trigger was clicked or tapped: show its reason, since touch has no tooltip. */
  const [explaining, setExplaining] = useState(false);
  const reasonId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const variants = usePopVariants();
  const showReason = explaining && Boolean(disabledReason);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!showReason) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExplaining(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showReason]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => entries[(next + entries.length) % entries.length]?.focus();
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(entries.length - 1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        tabIndex={triggerTabIndex}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={disabledReason ? true : undefined}
        aria-describedby={disabledReason ? reasonId : undefined}
        title={disabledReason ?? undefined}
        data-testid={testId}
        onClick={() => {
          if (disabledReason) {
            setExplaining((value) => !value);
            return;
          }
          setExplaining(false);
          setOpen((value) => !value);
        }}
        onBlur={() => setExplaining(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && showReason) {
            event.stopPropagation();
            setExplaining(false);
            return;
          }
          // Menu-button pattern: arrow keys open the menu and move into it.
          if (disabledReason) return;
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        <Icon name={icon} />
        {text ? <span className="max-sm:sr-only">{text}</span> : null}
        {disabledReason ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
      </button>
      <AnimatePresence>
        {showReason ? (
          // Visual only: screen readers already get the reason as the trigger's description.
          <motion.p
            key="reason"
            aria-hidden="true"
            data-testid={testId ? `${testId}-reason` : undefined}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-30 mt-1 w-max max-w-64 rounded-tile bg-inv px-4 py-2 text-meta font-medium text-on-inv shadow-pop"
          >
            {disabledReason}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={label}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-30 mt-1 flex w-max max-w-72 min-w-52 flex-col rounded-tile bg-card p-2 shadow-pop ring-1 ring-line"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  // Back on the trigger first, so a dialog opened by this item returns focus there.
                  trigger.current?.focus();
                  item.onSelect();
                }}
                className={`flex min-h-11 items-center gap-3 rounded-row px-3 text-left text-body font-medium transition-colors hover:bg-hover focus-visible:bg-hover active:bg-seg disabled:cursor-not-allowed disabled:opacity-50 ${
                  item.danger ? "text-danger" : "text-ink"
                }`}
              >
                <Icon name={item.icon} className="size-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
