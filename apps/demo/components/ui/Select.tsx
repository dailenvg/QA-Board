"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { FIELD_CLASS } from "./field-styles";
import { Icon, type IconName } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
  /** Nesting level, shown as indentation (a folder tree). */
  depth?: number;
  /** Leading icon, for an option that does something (such as "New folder…"). */
  icon?: IconName;
  /** Draws a divider above this option, to set it apart from the list. */
  separated?: boolean;
}

interface SelectProps {
  /** Id of the trigger, for a `<label htmlFor>`. */
  id: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  testId?: string;
}

/** Room the list wants before it opens upward instead (about five options). */
const PREFERRED_HEIGHT = 288;
/** Gap between the trigger and the list, and the list and its boundary. */
const GAP = 8;

/**
 * Select-only combobox (WAI-ARIA APG): focus stays on the trigger while arrow keys move the
 * highlight, Enter or Space picks, Escape closes, and typing a letter jumps to an option.
 * The list opens below, or above when its dialog (else the viewport) has more room there.
 */
export function Select({ id, value, options, onChange, testId }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number }>({
    up: false,
    maxHeight: PREFERRED_HEIGHT,
  });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const variants = usePopVariants();
  const reduce = useReducedMotion();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];
  const optionId = (index: number) => `${listId}-${index}`;

  const openList = (at = selectedIndex) => {
    setActive(at);
    setOpen(true);
  };
  const pick = (index: number) => {
    const option = options[index];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  };

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const bounds = trigger.current.closest('[role="dialog"]')?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const below = bounds.bottom - box.bottom - GAP * 2;
    const above = box.top - bounds.top - GAP * 2;
    const up = below < PREFERRED_HEIGHT && above > below;
    setPlacement({ up, maxHeight: Math.min(PREFERRED_HEIGHT, Math.max(up ? above : below, 120)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open)
      list.current
        ?.querySelector(`#${CSS.escape(optionId(active))}`)
        ?.scrollIntoView({ block: "nearest" });
    // optionId only depends on listId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      event.preventDefault();
      if (!open) {
        openList(key === "Home" ? 0 : key === "End" ? last : selectedIndex);
        return;
      }
      if (key === "ArrowDown") setActive((index) => Math.min(index + 1, last));
      else if (key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
      else setActive(key === "Home" ? 0 : last);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) pick(active);
      else openList();
    } else if (key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (key === "Tab" && open) {
      setOpen(false);
    } else if (key.length === 1 && /\S/.test(key)) {
      // Typeahead: the next option starting with this letter, after the highlighted one.
      const from = open ? active : selectedIndex;
      const letter = key.toLowerCase();
      for (let step = 1; step <= options.length; step++) {
        const index = (from + step) % options.length;
        if (options[index]?.label.toLowerCase().startsWith(letter)) {
          if (open) setActive(index);
          else pick(index);
          break;
        }
      }
    }
  };

  return (
    // data-popup-open: a dialog around this leaves Escape to the open list.
    <div ref={root} className="relative" data-popup-open={open ? "" : undefined}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        data-value={value}
        data-testid={testId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`${FIELD_CLASS} flex items-center gap-3 pr-3 text-left aria-expanded:ring-2 aria-expanded:ring-focus`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? instant : spring.ui}
          className={`grid size-6 shrink-0 place-items-center transition-colors ${
            open ? "text-brand-text" : "text-muted"
          }`}
        >
          <Icon name="chevronDown" className="size-5" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={list}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              maxHeight: placement.maxHeight,
              transformOrigin: placement.up ? "bottom center" : "top center",
            }}
            // Keeps focus on the trigger when an option is clicked.
            onMouseDown={(event) => event.preventDefault()}
            className={`absolute inset-x-0 z-30 flex flex-col overflow-y-auto overscroll-contain rounded-tile bg-card p-2 shadow-pop ring-1 ring-line ${
              placement.up ? "bottom-full mb-2" : "top-full mt-2"
            }`}
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const isActive = index === active;
              return (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onPointerMove={() => setActive(index)}
                  onClick={() => {
                    pick(index);
                    trigger.current?.focus();
                  }}
                  style={{ paddingLeft: `calc(0.75rem + ${(option.depth ?? 0) * 1.25}rem)` }}
                  className={`relative flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-row pr-3 text-body transition-colors ${
                    isActive ? "bg-brand-soft text-brand-text" : "text-ink"
                  } ${isSelected ? "font-semibold" : "font-medium"} ${
                    // A line, not an element: a listbox may only own options.
                    option.separated
                      ? "mt-2 before:absolute before:inset-x-3 before:-top-1 before:border-t before:border-line"
                      : ""
                  }`}
                >
                  {option.icon ? <Icon name={option.icon} className="size-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <Icon
                    name="check"
                    className={`size-4 shrink-0 text-brand-text ${isSelected ? "" : "invisible"}`}
                  />
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
