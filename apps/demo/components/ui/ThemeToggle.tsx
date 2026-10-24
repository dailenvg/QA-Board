"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration, ease, press } from "@/lib/motion";
import { applyTheme, type Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { Icon } from "./Icon";

interface ThemeToggleProps {
  className?: string;
}

/** Sun/moon button. Its accessible name is the action it performs. */
export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => applyTheme(next)}
      className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-pill bg-card text-ink shadow-seg transition-colors hover:bg-hover ${className}`}
      {...(reduce ? {} : press)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="grid place-items-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: duration.micro, ease: ease.out }}
        >
          <Icon name={theme === "dark" ? "moon" : "sun"} className="size-5" />
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
