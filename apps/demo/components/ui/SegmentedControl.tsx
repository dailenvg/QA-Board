"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { instant, spring } from "@/lib/motion";
import { Icon, type IconName } from "./Icon";
import { useRadioGroup } from "./use-radio-group";

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
  /** A small count beside the label, such as open comments; hidden at zero. */
  count?: number;
  /** What the count is, for screen readers: "3 open comments". */
  countLabel?: string;
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
  /** Selected thumb: raised neutral, or filled brand blue for the control that sets the app's mode. */
  tone?: "neutral" | "brand";
  /** `wide`: labels show from the `xl` breakpoint up; below it the options are icon-only. */
  labels?: "always" | "wide";
  /** `sm`: count chips show from the `sm` breakpoint up; below it they're only read out. */
  counts?: "always" | "sm";
  /** `sm`: icons show from the `sm` breakpoint up, so several labels fit on a phone. */
  icons?: "always" | "sm";
}

const THUMB = {
  neutral: "bg-seg-on shadow-seg",
  brand: "bg-brand shadow-seg",
} as const;

const SELECTED_TEXT = {
  neutral: "font-semibold text-ink",
  brand: "font-semibold text-on-brand",
} as const;

/**
 * Count chips (12px text, so 4.5:1). On the track: blue on brand-soft (4.5:1
 * light, 5.4:1 dark). On a neutral thumb a recessed `seg` pill instead, since
 * brand-soft over the dark thumb drops to 4.1:1 (5.2:1 light, 7.1:1 dark here).
 * On the brand thumb a 15% white wash keeps white numbers at 4.9:1 (20% is 4.4:1).
 */
const COUNT = {
  track: "bg-brand-soft text-brand-text",
  neutral: "bg-seg text-brand-text",
  brand: "bg-on-brand/15 text-on-brand",
} as const;

/** Unselected options: the hover wash sits inset like the thumb, while the whole 44px stays clickable. */
const IDLE =
  "font-medium text-muted before:absolute before:inset-1 before:rounded-pill before:transition-colors before:duration-150 hover:text-ink hover:before:bg-hover/60 active:before:bg-hover";

/**
 * Pill segmented control with radio-group semantics: one Tab stop, arrow keys
 * (and Home/End) move and select. The active option is raised; the thumb
 * animates via `layoutId`. The track is as tall as a button (44px): each
 * option fills it edge to edge, and the thumb is inset within the option.
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
  tone = "neutral",
  labels = "always",
  counts = "always",
  icons = "always",
}: SegmentedControlProps<T>) {
  const reduce = useReducedMotion();
  const baseId = useId();
  const group = useRadioGroup(options, value, onChange);
  const labelClass = labels === "wide" ? "relative max-xl:sr-only" : "relative";
  const countClass = counts === "sm" ? "max-sm:sr-only" : "";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex rounded-pill ${surface === "panel" ? "bg-panel" : "bg-seg"} ${
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
            ref={group.ref(index)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            aria-describedby={disabled && option.disabledReason ? reasonId : undefined}
            tabIndex={index === group.tabStop ? 0 : -1}
            title={disabled ? (option.disabledReason ?? option.title) : option.title}
            data-testid={option.testId}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            onKeyDown={(event) => group.onKeyDown(event, index)}
            // The focus ring is drawn inside the option, so a scrolling parent can't clip it.
            className={`relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-pill text-body whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2 ${
              labels === "wide" ? "px-3 xl:px-5" : "px-5"
            } ${stretch ? "flex-1" : ""} ${
              disabled
                ? "cursor-not-allowed font-medium text-muted opacity-50"
                : selected
                  ? SELECTED_TEXT[tone]
                  : IDLE
            }`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? instant : spring.snappy}
                className={`absolute inset-1 rounded-pill ${THUMB[tone]}`}
              />
            ) : null}
            {option.icon ? (
              <Icon
                name={option.icon}
                className={`relative size-4 ${icons === "sm" ? "max-sm:hidden" : ""}`}
              />
            ) : null}
            <span className={labelClass}>{option.label}</span>
            {option.count ? (
              <span
                className={`relative min-w-5 rounded-pill px-1.5 text-center text-label font-semibold tabular-nums ${
                  selected ? COUNT[tone] : COUNT.track
                } ${countClass}`}
              >
                <span className="sr-only">, </span>
                {option.count}
                {option.countLabel ? <span className="sr-only"> {option.countLabel}</span> : null}
              </span>
            ) : null}
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
