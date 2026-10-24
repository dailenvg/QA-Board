"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";
import { instant, spring } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  /** Extra hint, such as a keyboard shortcut, shown as a tooltip. */
  title?: string;
  testId?: string;
  /** Unavailable right now. Stays visible (and explained) rather than disappearing. */
  disabled?: boolean;
  /** Why the option is unavailable: shown as the tooltip and announced to screen readers. */
  disabledReason?: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Unique per control on the page; the raised thumb glides between options with it. */
  layoutId: string;
  className?: string;
  stretch?: boolean;
  /** Track color: `seg` on panels, `panel` on the page background. */
  surface?: "seg" | "panel";
}

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Pill segmented control with radio-group semantics: one Tab stop, arrow keys
 * (and Home/End) move and select. The active option is raised; the thumb
 * animates via `layoutId`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  layoutId,
  className = "",
  stretch = false,
  surface = "seg",
}: SegmentedControlProps<T>) {
  const reduce = useReducedMotion();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const selectedIndex = options.findIndex((option) => option.value === value);
  // The one Tab stop: the selected option, or the first available one.
  const tabStop =
    selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : (enabled[0] ?? -1);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (enabled.length === 0) return;
    const position = enabled.indexOf(index);
    let next: number | undefined;
    if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    else if (event.key in STEPS) {
      const from = position >= 0 ? position : 0;
      next = enabled[(from + (STEPS[event.key] ?? 0) + enabled.length) % enabled.length];
    }
    if (next === undefined) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    buttons.current[next]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-1 rounded-pill p-1 ${surface === "panel" ? "bg-panel" : "bg-seg"} ${
        stretch ? "w-full" : "w-max"
      } ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const disabled = Boolean(option.disabled);
        const reasonId = `${baseId}-${index}-reason`;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            aria-describedby={disabled && option.disabledReason ? reasonId : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            title={disabled ? (option.disabledReason ?? option.title) : option.title}
            data-testid={option.testId}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`relative flex min-h-11 items-center justify-center gap-2 rounded-pill px-4 text-body whitespace-nowrap transition-colors duration-150 ${
              stretch ? "flex-1" : ""
            } ${
              disabled
                ? "cursor-not-allowed font-medium text-muted opacity-50"
                : selected
                  ? "font-semibold text-ink"
                  : "font-medium text-muted hover:bg-hover/60 hover:text-ink active:bg-hover"
            }`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? instant : spring.snappy}
                className="absolute inset-0 rounded-pill bg-seg-on shadow-seg"
              />
            ) : null}
            {option.icon ? <Icon name={option.icon} className="relative size-4" /> : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
      {/* Outside the buttons so their visible text (and accessible name) stays the label alone. */}
      {options.map((option, index) =>
        option.disabled && option.disabledReason ? (
          <span key={option.value} id={`${baseId}-${index}-reason`} className="sr-only">
            {option.disabledReason}
          </span>
        ) : null,
      )}
    </div>
  );
}
