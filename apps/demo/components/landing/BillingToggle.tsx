"use client";

import { motion, useReducedMotion } from "motion/react";
import { instant, spring } from "@/lib/motion";
import type { Billing } from "@/lib/site";

const OPTIONS: ReadonlyArray<{ value: Billing; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface BillingToggleProps {
  value: Billing;
  onChange: (value: Billing) => void;
}

/** Segmented control; the selected pill glides between options via `layoutId`. */
export function BillingToggle({ value, onChange }: BillingToggleProps) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="inline-flex rounded-control bg-raised p-1 ring-1 ring-rule"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`relative min-h-11 rounded-control px-5 text-small font-semibold transition-colors duration-150 ${
              selected ? "text-on-accent" : "text-muted hover:text-ink"
            }`}
          >
            {selected ? (
              <motion.span
                layoutId="billing-indicator"
                transition={reduce ? instant : spring.snappy}
                className="absolute inset-0 rounded-control bg-accent"
              />
            ) : null}
            <span className="relative">
              {option.label}
              {option.value === "yearly" ? (
                <span className={selected ? "ml-2" : "ml-2 text-accent"}>-17%</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
