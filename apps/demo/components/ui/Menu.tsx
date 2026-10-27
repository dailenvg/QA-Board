"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { usePopVariants } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  /** Leading icon. Radio items (`checked` set) show their check there instead. */
  icon?: IconName;
  onSelect: () => void;
  /** Makes this one of a set of options (menuitemradio): true for the current one. */
  checked?: boolean;
  danger?: boolean;
  /** Stays focusable (aria-disabled), so a label that explains why is still read out. */
  disabled?: boolean;
}

/** Opens a menu from elsewhere, such as a context-menu key on a tree row. */
export interface MenuHandle {
  /** `from`: the control that asked, which gets focus back when the menu closes. */
  open: (from?: HTMLElement | null) => void;
}

/** Plain and radio items alike. */
const ITEM = '[role^="menuitem"]';
const ENABLED_ITEM = `${ITEM}:not([aria-disabled="true"])`;

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
  /** Replaces the trigger text's default classes (`max-sm:sr-only`), e.g. to keep it on phones. */
  textClassName?: string;
  /** Replaces the default (ghost) trigger styling. */
  triggerClassName?: string;
  /** Unavailable right now: the trigger stays focusable and explains why. */
  disabledReason?: string | null;
  /**
   * -1 keeps the trigger out of the Tab order, for menus inside a widget with
   * its own keyboard model (a tree row); its actions must be reachable elsewhere.
   */
  triggerTabIndex?: number;
  /** Opens the menu without its trigger (`MenuHandle.open`). */
  handle?: Ref<MenuHandle>;
  /** Where focus goes when the menu closes or an item is chosen; the trigger by default. */
  returnFocus?: () => HTMLElement | null;
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
  textClassName = "max-sm:sr-only",
  triggerClassName = TRIGGER_CLASS,
  disabledReason = null,
  triggerTabIndex,
  handle,
  returnFocus,
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
  /** Set when `MenuHandle.open` came from another control; the trigger clears it. */
  const openedFrom = useRef<HTMLElement | null>(null);

  const openMenu = (from: HTMLElement | null = null) => {
    if (disabledReason) return;
    openedFrom.current = from;
    setExplaining(false);
    setOpen(true);
  };
  useImperativeHandle(handle, () => ({ open: openMenu }));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Options open on the current one; actions on the first available.
    const first =
      root.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      root.current?.querySelector<HTMLElement>(ENABLED_ITEM) ??
      root.current?.querySelector<HTMLElement>(ITEM);
    first?.focus();
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

  const focusBack = () => {
    const from = openedFrom.current?.isConnected ? openedFrom.current : null;
    (from ?? returnFocus?.() ?? trigger.current)?.focus();
  };

  const close = () => {
    setOpen(false);
    focusBack();
  };

  // Disabled items stay in the arrow-key order (WAI-ARIA menu pattern), so their reason is heard.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
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
          openedFrom.current = null;
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
            openedFrom.current = null;
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        <Icon name={icon} />
        {text ? <span className={textClassName}>{text}</span> : null}
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
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked}
                aria-disabled={item.disabled || undefined}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  // Back on the trigger (or `returnFocus`) first, so a dialog opened by this item
                  // returns focus there.
                  focusBack();
                  item.onSelect();
                }}
                className={`flex min-h-11 items-center gap-3 rounded-row px-3 text-left text-body font-medium transition-colors focus-visible:bg-hover ${
                  item.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-hover active:bg-seg"
                } ${item.danger ? "text-danger" : "text-ink"}`}
              >
                <ItemIcon item={item} />
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** An item's icon, or for a radio item the check that marks the current option. */
function ItemIcon({ item }: { item: MenuItem }) {
  if (item.checked !== undefined) {
    return (
      <Icon
        name="check"
        className={`size-4 shrink-0 text-brand-text ${item.checked ? "" : "invisible"}`}
      />
    );
  }
  return item.icon ? <Icon name={item.icon} className="size-4 shrink-0" /> : null;
}
