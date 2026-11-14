"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { revealViewport, useRevealVariants } from "@/lib/motion";
import { Icon, type IconName } from "../ui/Icon";

/** Beside the title: one of Squint's icons, or another tool's own mark (its integration's card). */
type CardSymbol = { icon: IconName; mark?: never } | { mark: ReactNode; icon?: never };

type SettingsCardProps = CardSymbol & {
  title: string;
  description: ReactNode;
  children: ReactNode;
  testId?: string;
  /** The card's `id`, so a link elsewhere can lead straight to it (`/account/profile#clickup`). */
  anchorId?: string;
};

/**
 * One group of settings: an icon, a title and what it does, then its form.
 * Rises in as it scrolls into view (a plain fade with reduced motion).
 */
export function SettingsCard({
  title,
  description,
  icon,
  mark,
  children,
  testId,
  anchorId,
}: SettingsCardProps) {
  const variants = useRevealVariants();
  const titleId = useId();
  return (
    <motion.section
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      id={anchorId}
      aria-labelledby={titleId}
      data-testid={testId}
      className="flex scroll-mt-6 flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6"
    >
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text">
          {icon ? <Icon name={icon} className="size-5" /> : mark}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-heading font-semibold">
            {title}
          </h2>
          {/* wrap-anywhere: a long sign-in email in the description can't push past a phone's edge. */}
          <div className="text-body text-pretty text-muted wrap-anywhere">{description}</div>
        </div>
      </header>
      {children}
    </motion.section>
  );
}
