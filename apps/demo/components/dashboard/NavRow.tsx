"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { instant, spring } from "@/lib/motion";
import { Icon, type IconName } from "../ui/Icon";

interface NavRowProps {
  href: string;
  icon: IconName;
  label: string;
  /** This row's page is open: the current page, in the brand colour and weight. */
  active: boolean;
  /** The open page is inside this row's section (a folder's page, for Folders): marked the same. */
  inSection?: boolean;
  /**
   * Holds the gliding tint (the active row's, by default). A section's row takes it only when
   * the row of the page itself isn't showing.
   */
  tinted?: boolean;
  id?: string;
  /**
   * The active background's shared `layoutId`. Rows that share one glide between each other:
   * the sidebar's rows all use the default; another nav passes its own.
   */
  indicatorId?: string;
  /** Trailing content, such as a count. */
  children?: ReactNode;
}

/**
 * Sidebar link row. The active row is tinted in the brand colour, its label and
 * icon too; the tint is one shared `layoutId` element, so it glides between
 * Overview, Folders and every folder.
 */
export function NavRow({
  href,
  icon,
  label,
  active,
  inSection = false,
  tinted = active,
  id,
  indicatorId = "nav-indicator",
  children,
}: NavRowProps) {
  const reduce = useReducedMotion();
  const marked = active || inSection;
  const tone = `${marked ? "font-semibold text-brand-text" : "font-medium"} ${
    tinted ? "" : "hover:bg-hover active:bg-seg"
  }`;
  return (
    <Link
      id={id}
      href={href}
      scroll={false}
      aria-current={active ? "page" : inSection ? "true" : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-row px-4 text-nav transition-colors ${tone}`}
    >
      {tinted ? (
        <motion.span
          layoutId={indicatorId}
          transition={reduce ? instant : spring.snappy}
          className="absolute inset-0 rounded-row bg-brand-soft"
        />
      ) : null}
      <Icon name={icon} className="relative size-5 shrink-0" />
      <span className="relative min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
      {children}
    </Link>
  );
}
