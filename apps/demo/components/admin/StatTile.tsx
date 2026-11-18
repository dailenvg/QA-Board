"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useRevealVariants } from "@/lib/motion";
import { Icon, type IconName } from "../ui/Icon";

interface StatTileProps {
  label: string;
  /** The figure itself: a counting number, or formatted text (bytes). */
  value: ReactNode;
  /** What the figure counts, under it. */
  note: string;
  icon: IconName;
  testId: string;
}

/** One headline figure: what it is, the number, and what it counts. Rises in with its group. */
export function StatTile({ label, value, note, icon, testId }: StatTileProps) {
  const variants = useRevealVariants();
  return (
    <motion.li
      variants={variants}
      data-testid={testId}
      className="flex min-w-0 flex-col gap-3 rounded-card bg-card p-4 shadow-seg sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text">
          <Icon name={icon} className="size-4" />
        </span>
        <h3 className="min-w-0 text-body font-semibold text-pretty">{label}</h3>
      </div>
      <p className="text-display font-bold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </p>
      <p className="text-meta text-pretty text-muted">{note}</p>
    </motion.li>
  );
}
