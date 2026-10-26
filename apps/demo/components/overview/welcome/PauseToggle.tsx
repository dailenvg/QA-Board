"use client";

import { motion, useReducedMotion } from "motion/react";
import { press } from "@/lib/motion";
import { Icon } from "../../ui/Icon";

interface PauseToggleProps {
  paused: boolean;
  onChange: (paused: boolean) => void;
}

/**
 * Stops and restarts the welcome stories (WCAG 2.2.2). A toggle button: its
 * name stays "Pause animations" and `aria-pressed` says whether they're paused.
 *
 * A quiet utility, not an action: muted ghost text that fills on hover and
 * when pressed, still a 44px target. Its own classes rather than Button's
 * ghost, whose hover fill matches the tile panel it sits on in light mode.
 */
export function PauseToggle({ paused, onChange }: PauseToggleProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      aria-pressed={paused}
      onClick={() => onChange(!paused)}
      data-testid="welcome-stories-pause"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-4 text-body font-semibold text-muted transition-[color,background-color,box-shadow] duration-150 select-none hover:bg-card hover:text-ink active:bg-card active:text-ink aria-pressed:bg-brand-soft aria-pressed:text-brand-text"
      {...(reduce ? {} : press)}
    >
      <Icon name={paused ? "play" : "pause"} className="size-4" />
      Pause animations
    </motion.button>
  );
}
