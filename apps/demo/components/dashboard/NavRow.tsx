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
  active: boolean;
  /** Trailing content, such as a count. */
  children?: ReactNode;
}

/**
 * Sidebar link row. The active row's background is one shared `layoutId`
 * element, so it glides between the Overview and every folder.
 */
export function NavRow({ href, icon, label, active, children }: NavRowProps) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-3 rounded-row px-4 text-nav transition-colors ${
        active ? "font-semibold" : "font-medium hover:bg-hover active:bg-seg"
      }`}
    >
      {active ? (
        <motion.span
          layoutId="nav-indicator"
          transition={reduce ? instant : spring.snappy}
          className="absolute inset-0 rounded-row bg-seg"
        />
      ) : null}
      <Icon name={icon} className="relative size-5 shrink-0" />
      <span className="relative min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
      {children}
    </Link>
  );
}
