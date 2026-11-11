"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";
import { closesOnSelect, itemRole, ITEM_SELECTOR, type MenuItem } from "./menu-item";

export type { MenuItem } from "./menu-item";

/** Opens a menu from elsewhere, such as a context-menu key on a tree row. */
export interface MenuHandle {
  /** `from`: the control that asked, which gets focus back when the menu closes. */
  open: (from?: HTMLElement | null) => void;
}

const ENABLED_ITEM = `${ITEM_SELECTOR}:not([aria-disabled="true"])`;

/** Below the trigger, or above it for a trigger at the foot of the screen. */
type MenuPlacement = "below" | "above";

const PLACEMENT_CLASS: Record<MenuPlacement, string> = {
  below: "top-full mt-1",
  above: "bottom-full mb-1",
};

const PLACEMENT_ORIGIN: Record<MenuPlacement, string> = {
  below: "top right",
  above: "bottom right",
};

/**
 * Which of the trigger's edges the menu lines up with: its right edge (`end`), or its left
 * edge (`start`) for a trigger near the left of the screen, such as the label filter once it
 * wraps under the status filter on a phone.
 */
type MenuAlign = "end" | "start";

const ALIGN_CLASS: Record<MenuAlign, string> = { end: "right-0", start: "left-0" };

function menuOrigin(side: MenuPlacement, align: MenuAlign): string {
  return `${side === "below" ? "top" : "bottom"} ${align === "end" ? "right" : "left"}`;
}

/** The gap between the trigger and the menu (`mt-1` / `mb-1`). */
const GAP = 4;
/** Room the menu keeps from the edge of the screen (or its dialog). */
const EDGE = 8;

/**
 * The visible part of a scroller marked `data-menu-bounds` around `anchor` (the sidebar's
 * navigation), while it clips (on narrow screens it doesn't scroll, so the screen bounds).
 */
function clippingBounds(anchor: HTMLElement): { top: number; bottom: number } | null {
  const scroller = anchor.closest<HTMLElement>("[data-menu-bounds]");
  if (!scroller || getComputedStyle(scroller).overflowY === "visible") return null;
  const box = scroller.getBoundingClientRect();
  return { top: Math.max(0, box.top), bottom: Math.min(window.innerHeight, box.bottom) };
}

/**
 * `preferred`, unless the menu would cross the screen's (or its dialog's) edge on that side and
 * fits on the other: a menu above a trigger scrolled to the top of a phone opens below it.
 */
function fittingSide(
  preferred: MenuPlacement,
  anchor: HTMLElement | null,
  menu: HTMLElement | null,
): MenuPlacement {
  if (!anchor || !menu) return preferred;
  const box = anchor.getBoundingClientRect();
  // Not laid out (hidden): nothing to measure against.
  if (!box.height) return preferred;
  const bounds = anchor.closest('[role="dialog"]')?.getBoundingClientRect() ??
    clippingBounds(anchor) ?? { top: 0, bottom: window.innerHeight };
  // offsetHeight ignores the pop-in's scale, so this is the menu's full height.
  const needed = menu.offsetHeight + GAP + EDGE;
  const fits: Record<MenuPlacement, boolean> = {
    above: box.top - bounds.top >= needed,
    below: bounds.bottom - box.bottom >= needed,
  };
  const other: MenuPlacement = preferred === "above" ? "below" : "above";
  return !fits[preferred] && fits[other] ? other : preferred;
}

/**
 * Lined up with the trigger's right edge, unless the menu would then cross the left edge of the
 * screen (or its dialog) and fits lined up with the trigger's left edge instead.
 */
function fittingAlign(anchor: HTMLElement | null, menu: HTMLElement | null): MenuAlign {
  if (!anchor || !menu) return "end";
  const box = anchor.getBoundingClientRect();
  if (!box.width) return "end";
  const bounds = anchor.closest('[role="dialog"]')?.getBoundingClientRect() ?? {
    left: 0,
    right: window.innerWidth,
  };
  // offsetWidth ignores the pop-in's scale, so this is the menu's full width.
  const width = menu.offsetWidth;
  const fitsEnd = box.right - width >= bounds.left + EDGE;
  const fitsStart = box.left + width <= bounds.right - EDGE;
  return !fitsEnd && fitsStart ? "start" : "end";
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
  /**
   * Which side of the trigger the menu opens on (below by default), aligned to the trigger's
   * right edge. It flips to the other side when only that side has room on screen.
   */
  placement?: MenuPlacement;
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
  placement = "below",
}: MenuProps) {
  const [open, setOpen] = useState(false);
  /** A disabled trigger was clicked or tapped: show its reason, since touch has no tooltip. */
  const [explaining, setExplaining] = useState(false);
  const reasonId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const variants = usePopVariants();
  const showReason = explaining && Boolean(disabledReason);
  /** Set when `MenuHandle.open` came from another control; the trigger clears it. */
  const openedFrom = useRef<HTMLElement | null>(null);
  /**
   * The side the open menu is on: `placement`, unless only the other side has room on screen.
   * Null until it's measured for this opening (before paint). The first item waits for it, so
   * focusing it never scrolls the page toward the side the menu is about to leave.
   */
  const [placedSide, setPlacedSide] = useState<MenuPlacement | null>(null);
  const side = placedSide ?? placement;
  /** Which edge of the trigger the open menu lines up with, measured with its side. */
  const [align, setAlign] = useState<MenuAlign>("end");

  const openMenu = (from: HTMLElement | null = null) => {
    if (disabledReason) return;
    openedFrom.current = from;
    setExplaining(false);
    setOpen(true);
  };
  useImperativeHandle(handle, () => ({ open: openMenu }));

  useLayoutEffect(() => {
    if (!open) return;
    setPlacedSide(fittingSide(placement, root.current, menu.current));
    // Kept after closing (no reset), so the menu fades out where it was; the next opening
    // measures again before it paints.
    setAlign(fittingAlign(root.current, menu.current));
    return () => setPlacedSide(null);
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !placedSide) return;
    // Options open on the current one; actions (and settings) on the first available.
    const first =
      root.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
      root.current?.querySelector<HTMLElement>(ENABLED_ITEM) ??
      root.current?.querySelector<HTMLElement>(ITEM_SELECTOR);
    first?.focus();
  }, [open, placedSide]);

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

  const choose = (item: MenuItem) => {
    // Back on the trigger (or `returnFocus`) first, so a dialog opened by this item returns
    // focus there.
    if (closesOnSelect(item)) close();
    item.onSelect?.();
  };

  // Disabled items stay in the arrow-key order (WAI-ARIA menu pattern), so their reason is heard.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
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
            style={{ transformOrigin: PLACEMENT_ORIGIN[placement] }}
            className={`absolute right-0 z-30 ${PLACEMENT_CLASS[placement]} w-max max-w-64 rounded-tile bg-inv px-4 py-2 text-meta font-medium text-on-inv shadow-pop`}
          >
            {disabledReason}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: menuOrigin(side, align) }}
            className={`absolute ${ALIGN_CLASS[align]} z-30 ${PLACEMENT_CLASS[side]} flex w-max max-w-72 min-w-52 flex-col rounded-tile bg-card p-2 shadow-pop ring-1 ring-line`}
          >
            {items.map((item) => (
              <Fragment key={item.id ?? item.label}>
                {item.separatorBefore ? (
                  <div role="separator" className="mx-1 my-1 h-px shrink-0 bg-line" />
                ) : null}
                <MenuEntry item={item} onChoose={() => choose(item)} />
              </Fragment>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Disabled or busy: it stays focusable (aria-disabled) but does nothing. */
function unavailable(item: MenuItem): boolean {
  return Boolean(item.disabled || item.busy);
}

function itemClass(item: MenuItem): string {
  // Busy keeps full strength: its label is the progress, and it has to stay readable.
  const state = item.disabled
    ? "cursor-not-allowed opacity-50"
    : item.busy
      ? "cursor-wait"
      : "hover:bg-hover active:bg-seg";
  return `flex min-h-11 items-center gap-3 rounded-row px-3 text-left text-body font-medium transition-colors focus-visible:bg-hover ${state} ${itemTone(item)}`;
}

/** Danger in red; a link to the open page tinted, like the sidebar's current row. */
function itemTone(item: MenuItem): string {
  if (item.danger) return "text-danger";
  return item.current ? "bg-brand-soft text-brand-text" : "text-ink";
}

/** One item: a link to another page, or a button for an action, option or setting. */
function MenuEntry({ item, onChoose }: { item: MenuItem; onChoose: () => void }) {
  const content = (
    <>
      <ItemIcon item={item} />
      <span className="flex-1">{item.label}</span>
      {item.kind === "checkbox" ? <ItemSwitch on={Boolean(item.checked)} /> : null}
    </>
  );
  if (item.href !== undefined) {
    return (
      <Link
        href={item.href}
        role="menuitem"
        aria-current={item.current ? "page" : undefined}
        aria-disabled={unavailable(item) || undefined}
        data-testid={item.testId}
        onClick={(event) => {
          if (unavailable(item)) event.preventDefault();
          else onChoose();
        }}
        className={itemClass(item)}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={itemRole(item)}
      aria-checked={item.kind === "checkbox" ? Boolean(item.checked) : item.checked}
      aria-disabled={unavailable(item) || undefined}
      data-testid={item.testId}
      onClick={() => {
        if (!unavailable(item)) onChoose();
      }}
      className={itemClass(item)}
    >
      {content}
    </button>
  );
}

/** A checkbox item's on/off track; the item itself carries the state for assistive tech. */
function ItemSwitch({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-9 shrink-0 rounded-pill p-0.5 transition-colors ${
        on ? "bg-brand-text" : "bg-muted"
      }`}
    >
      {/*
        Slid by transform across the track's inner width less the knob (2.25 - 0.25 - 1 = 1rem),
        not by `layout`: a layout animation would also chase the menu itself when it moves.
      */}
      <motion.span
        initial={false}
        animate={{ x: on ? "1rem" : "0rem" }}
        transition={reduce ? instant : spring.snappy}
        className="size-4 rounded-pill bg-card"
      />
    </span>
  );
}

/** An item's icon, or for a radio item the check that marks the current option. */
function ItemIcon({ item }: { item: MenuItem }) {
  if (itemRole(item) === "menuitemradio") {
    return (
      <Icon
        name="check"
        className={`size-4 shrink-0 text-brand-text ${item.checked ? "" : "invisible"}`}
      />
    );
  }
  return item.icon ? <Icon name={item.icon} className="size-4 shrink-0" /> : null;
}
