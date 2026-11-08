"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { revealViewport, useRevealVariants } from "@/lib/motion";
import { Icon, type IconName } from "../ui/Icon";

interface SettingsCardProps {
  title: string;
  description: ReactNode;
  icon: IconName;
  children: ReactNode;
  testId?: string;
}

/**
 * One group of settings: an icon, a title and what it does, then its form.
 * Rises in as it scrolls into view (a plain fade with reduced motion).
 */
export function SettingsCard({ title, description, icon, children, testId }: SettingsCardProps) {
  const variants = useRevealVariants();
  const titleId = useId();
  return (
    <motion.section
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      aria-labelledby={titleId}
      data-testid={testId}
      className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6"
    >
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text">
          <Icon name={icon} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-heading font-semibold">
            {title}
          </h2>
          <div className="text-body text-pretty text-muted">{description}</div>
        </div>
      </header>
      {children}
    </motion.section>
  );
}
