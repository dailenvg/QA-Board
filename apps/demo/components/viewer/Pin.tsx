"use client";

import { motion, useReducedMotion } from "motion/react";
import { press, spring } from "@/lib/motion";

type PinTone = "active" | "resolved" | "draft" | "unsent";

interface PinProps {
  id?: string;
  number: number | null;
  x: number;
  y: number;
  tone: PinTone;
  selected?: boolean;
  label: string;
  onSelect?: () => void;
}

const TONES: Record<PinTone, string> = {
  active: "bg-brand text-on-brand",
  resolved: "border-2 border-resolved bg-card text-resolved-text",
  draft: "bg-inv text-on-inv",
  /** A draft whose post failed: kept, and marked until it goes through. */
  unsent: "bg-danger text-card",
};

/**
 * Numbered teardrop marker. Its sharp bottom-left corner sits exactly on the
 * point; the 44px button around it keeps the touch target generous. Halo,
 * selection and focus rings come from `.pin-marker` in globals.css so they
 * stay visible over any page or image.
 */
export function Pin({ id, number, x, y, tone, selected = false, label, onSelect }: PinProps) {
  const reduce = useReducedMotion();
  const interactive = Boolean(onSelect);
  return (
    <motion.button
      type="button"
      data-pin-id={id}
      data-testid={tone === "draft" || tone === "unsent" ? "draft-pin" : "pin"}
      data-status={tone}
      aria-label={label}
      aria-pressed={interactive ? selected : undefined}
      // The draft pin only marks where the composer points; the composer itself is announced.
      aria-hidden={interactive ? undefined : true}
      tabIndex={interactive ? 0 : -1}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      // Scales from the tip so a selected pin never drifts off its point.
      style={{ left: `${x}%`, top: `${y}%`, translate: "0 -100%", transformOrigin: "0 100%" }}
      className={`absolute flex size-11 items-end justify-start focus-visible:outline-none ${
        selected ? "z-20" : "z-10"
      } ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: selected && !reduce ? 1.15 : 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
      transition={spring.snappy}
      whileHover={reduce || !interactive ? undefined : { scale: selected ? 1.18 : 1.08 }}
      whileTap={reduce || !interactive ? undefined : press.whileTap}
    >
      <span
        aria-hidden="true"
        data-selected={selected || undefined}
        className={`pin-marker grid size-8 place-items-center rounded-pin text-label font-bold transition-shadow ${TONES[tone]}`}
      >
        {number ?? (tone === "unsent" ? "!" : "+")}
      </span>
    </motion.button>
  );
}
