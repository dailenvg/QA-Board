"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  type Variants,
} from "motion/react";
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
  type ReactNode,
  type Ref,
} from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";
import {
  closesOnSelect,
  itemRole,
  ITEM_SELECTOR,
  menuSections,
  type MenuItem,
  type MenuSection,
} from "./menu-item";
import { cappedHeight, chooseSide, type MenuPlacement } from "./menu-side";

export type { MenuItem } from "./menu-item";

/** Opens a menu from elsewhere, such as a context-menu key on a tree row, or closes it. */
export interface MenuHandle {
  /** `from`: the control that asked, which gets focus back when the menu closes. */
  open: (from?: HTMLElement | null) => void;
  /** Closes it, focus back as on Escape: once a `keepOpen` item's work is done. */
  close: () => void;
}

const ENABLED_ITEM = `${ITEM_SELECTOR}:not([aria-disabled="true"])`;

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

interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The visible part of a scroller marked `data-menu-bounds` around `anchor` (the sidebar's
 * navigation, the viewer's comment list), while it clips (on narrow screens the sidebar
 * doesn't scroll, so the screen bounds). A scroller clips both ways, so its sides count too.
 */
function clippingBounds(anchor: HTMLElement): Bounds | null {
  const scroller = anchor.closest<HTMLElement>("[data-menu-bounds]");
  if (!scroller || getComputedStyle(scroller).overflowY === "visible") return null;
  const box = scroller.getBoundingClientRect();
  return {
    top: Math.max(0, box.top),
    bottom: Math.min(window.innerHeight, box.bottom),
    left: Math.max(0, box.left),
    right: Math.min(window.innerWidth, box.right),
  };
}

/** Whether `node` cuts off what overflows it (it scrolls, or hides the rest). */
function clips(node: Element): boolean {
  const style = getComputedStyle(node);
  return style.overflowX !== "visible" || style.overflowY !== "visible";
}

/**
 * A popover's (a non-modal dialog's) bounds: its own box while it clips (a phone's docked pin
 * popover scrolls), else the nearest box around it that clips (the stage, a live site's frame),
 * cut to the screen; null for the screen. A menu in it may spill past its edge, over the stage,
 * as menus float over what's around them; only a modal dialog keeps its menus inside it.
 */
function popoverBounds(dialog: Element): Bounds | null {
  let node: Element | null = dialog;
  while (node && node !== document.body && !clips(node)) node = node.parentElement;
  if (!node || node === document.body) return null;
  const box = node.getBoundingClientRect();
  return {
    top: Math.max(0, box.top),
    bottom: Math.min(window.innerHeight, box.bottom),
    left: Math.max(0, box.left),
    right: Math.min(window.innerWidth, box.right),
  };
}

/**
 * What the menu must stay inside: a `data-menu-bounds` scroller in (or without) a dialog, such
 * as the replies in a pin's popover; else a modal dialog, or what clips a popover
 * (`popoverBounds`); else null, for the screen.
 */
function menuBounds(anchor: HTMLElement): Bounds | DOMRect | null {
  const dialog = anchor.closest('[role="dialog"]');
  const scroller = anchor.closest("[data-menu-bounds]");
  const clip = !dialog || (scroller && dialog.contains(scroller)) ? clippingBounds(anchor) : null;
  if (clip || !dialog) return clip;
  return dialog.getAttribute("aria-modal") === "true"
    ? dialog.getBoundingClientRect()
    : popoverBounds(dialog);
}

/** The side the menu opens on, and the height it's capped to there (null: uncapped). */
interface MenuFit {
  side: MenuPlacement;
  maxHeight: number | null;
}

/**
 * `preferred`, unless the menu would cross the screen's (or its `menuBounds`') edge on that side and
 * fits on the other: a menu above a trigger scrolled to the top of a phone opens below it. Fitting
 * neither, it takes the side with more room (`chooseSide`) and scrolls inside itself there
 * (`cappedHeight`), rather than being cut off.
 */
function fittingSide(
  preferred: MenuPlacement,
  anchor: HTMLElement | null,
  menu: HTMLElement | null,
): MenuFit {
  const uncapped: MenuFit = { side: preferred, maxHeight: null };
  if (!anchor || !menu) return uncapped;
  const box = anchor.getBoundingClientRect();
  // Not laid out (hidden): nothing to measure against.
  if (!box.height) return uncapped;
  const bounds = menuBounds(anchor) ?? { top: 0, bottom: window.innerHeight };
  // scrollHeight ignores the pop-in's scale and a cap left from the last opening, so this is
  // the menu's full height.
  const needed = menu.scrollHeight + GAP + EDGE;
  const room = { above: box.top - bounds.top, below: bounds.bottom - box.bottom };
  const side = chooseSide(preferred, room, needed);
  return { side, maxHeight: cappedHeight(side, room, needed, GAP + EDGE) };
}

/**
 * Lined up with the trigger's right edge, unless the menu would then cross the left edge of the
 * screen (or its `menuBounds`) and fits lined up with the
 * trigger's left edge instead.
 */
function fittingAlign(anchor: HTMLElement | null, menu: HTMLElement | null): MenuAlign {
  if (!anchor || !menu) return "end";
  const box = anchor.getBoundingClientRect();
  if (!box.width) return "end";
  const bounds = menuBounds(anchor) ?? { left: 0, right: window.innerWidth };
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
  /** Trigger icon; `more` (···) by default, null for a trigger with only its `text`. */
  icon?: IconName | null;
  /**
   * A dot on the trigger's corner, for a menu whose choice is changed from its default (a
   * filter that's on). Visual only: say what changed elsewhere (a live region, the label).
   */
  indicator?: boolean;
  /** Visible trigger text, hidden on phones. Without it the trigger is icon-only. */
  text?: string;
  /** Replaces the trigger text's default classes (`max-sm:sr-only`), e.g. to keep it on phones. */
  textClassName?: string;
  /** Replaces the default (ghost) trigger styling. */
  triggerClassName?: string;
  /**
   * What the trigger shows in place of its icon and text, such as a chip that opens its own
   * menu (the viewer's stage). Visual only: `label` stays the trigger's name.
   */
  triggerContent?: ReactNode;
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
  indicator = false,
  text,
  textClassName = "max-sm:sr-only",
  triggerClassName = TRIGGER_CLASS,
  triggerContent,
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
  /** The open menu's cap where neither side has room for all of it (it scrolls); null: none. */
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const openMenu = (from: HTMLElement | null = null) => {
    if (disabledReason) return;
    openedFrom.current = from;
    setExplaining(false);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const fit = fittingSide(placement, root.current, menu.current);
    setPlacedSide(fit.side);
    // The cap and the alignment are kept after closing (no reset), so the menu fades out as it
    // was; the next opening measures again before it paints.
    setMaxHeight(fit.maxHeight);
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
    const scope = root.current;
    const items = Array.from(scope?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    // A menu of options only (Sort, Sort and filter) opens on the current one. One that mixes
    // actions in (a comment's More: Copy link, Priority, Get info) opens on its first available
    // item, as a menu button does (WAI-ARIA), so its order never depends on the priority set:
    // the check marks the current option, and arrow keys reach it.
    const optionsOnly =
      items.length > 0 && items.every((item) => item.getAttribute("role") === "menuitemradio");
    const first =
      (optionsOnly
        ? scope?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
        : null) ??
      scope?.querySelector<HTMLElement>(ENABLED_ITEM) ??
      items[0];
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

  useImperativeHandle(handle, () => ({
    open: openMenu,
    close: () => {
      if (open) close();
    },
  }));

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
        className={`${triggerClassName} ${indicator ? "relative" : ""}`}
      >
        {triggerContent ?? (icon ? <Icon name={icon} /> : null)}
        {indicator ? (
          <span
            aria-hidden="true"
            data-testid={testId ? `${testId}-indicator` : undefined}
            className="absolute top-2 right-2 size-2 rounded-pill bg-brand-text shadow-[0_0_0_2px_var(--color-panel)]"
          />
        ) : null}
        {text && !triggerContent ? <span className={textClassName}>{text}</span> : null}
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
          <MenuPanel
            ref={menu}
            id={menuId}
            label={label}
            variants={variants}
            side={side}
            align={align}
            maxHeight={maxHeight}
          >
            {menuSections(items).map((section, index) => (
              <Fragment key={`section-${index}`}>
                {index > 0 ? <Separator /> : null}
                <MenuSectionItems
                  section={section}
                  headingId={`${menuId}-group-${index}`}
                  onChoose={choose}
                />
              </Fragment>
            ))}
          </MenuPanel>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface MenuPanelProps {
  ref: Ref<HTMLDivElement>;
  id: string;
  label: string;
  variants: Variants;
  side: MenuPlacement;
  align: MenuAlign;
  maxHeight: number | null;
  children: ReactNode;
}

/**
 * The open menu. While it fades out it takes no pointer events, so a quick tap just after a
 * pick lands on what's under it rather than picking again from the leaving items.
 */
function MenuPanel({ ref, id, label, variants, side, align, maxHeight, children }: MenuPanelProps) {
  const present = useIsPresent();
  return (
    <motion.div
      ref={ref}
      id={id}
      role="menu"
      aria-label={label}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{ transformOrigin: menuOrigin(side, align), maxHeight: maxHeight ?? undefined }}
      className={`absolute ${ALIGN_CLASS[align]} z-30 ${PLACEMENT_CLASS[side]} flex w-max max-w-72 min-w-52 flex-col rounded-tile bg-card p-2 shadow-pop ring-1 ring-line ${
        maxHeight === null ? "" : "overflow-y-auto overscroll-contain"
      } ${present ? "" : "pointer-events-none"}`}
    >
      {children}
    </motion.div>
  );
}

function Separator() {
  return <div role="separator" className="mx-1 my-1 h-px shrink-0 bg-line" />;
}

/**
 * A section's items: a labelled group under its heading (the heading names the group; it's
 * hidden from reading on its own, so it isn't heard twice), or ungrouped ones, each with its
 * own line above when it asks for one.
 */
function MenuSectionItems({
  section,
  headingId,
  onChoose,
}: {
  section: MenuSection;
  headingId: string;
  onChoose: (item: MenuItem) => void;
}) {
  const entries = section.items.map((item, index) => (
    <Fragment key={item.id ?? item.label}>
      {item.separatorBefore && index > 0 ? <Separator /> : null}
      <MenuEntry item={item} onChoose={() => onChoose(item)} />
    </Fragment>
  ));
  if (section.label === null) return entries;
  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col">
      <div
        id={headingId}
        aria-hidden="true"
        className="px-3 pt-1 pb-1 text-label font-semibold text-muted"
      >
        {section.label}
      </div>
      {entries}
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
