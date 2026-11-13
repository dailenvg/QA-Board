"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";
import { instant, spring } from "@/lib/motion";

type ButtonRest = Omit<
  ComponentProps<"button">,
  "type" | "role" | "onClick" | "onChange" | "children" | "className"
>;

interface SwitchProps extends ButtonRest {
  checked: boolean;
  onChange: () => void;
  /** Id of the visible text that names it. */
  labelledBy: string;
  /** Ids of text that says what it does now. */
  describedBy?: string;
  /** Busy or unavailable: it stays focusable, so its reason is read. */
  inactive?: boolean;
  controls?: string;
  testId?: string;
}

/**
 * An on/off switch (`role="switch"`): a pill with a thumb that springs
 * across, inside a 44px target. Brand blue when on, a neutral track when off.
 */
export function Switch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  inactive = false,
  controls,
  testId,
  ...rest
}: SwitchProps) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={inactive || undefined}
      aria-controls={controls}
      onClick={inactive ? undefined : onChange}
      data-testid={testId}
      {...rest}
      className="group grid size-11 shrink-0 place-items-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <span
        className={`flex h-7 w-11 items-center rounded-pill p-0.5 ring-1 transition-colors duration-150 ring-inset ${
          checked
            ? "justify-end bg-brand ring-brand group-hover:bg-brand-hover"
            : "justify-start bg-seg ring-field-line group-hover:bg-hover"
        }`}
      >
        <motion.span
          layout
          transition={reduce ? instant : spring.snappy}
          className="block size-6 rounded-pill bg-card shadow-seg group-active:scale-95"
        />
      </span>
    </button>
  );
}
