"use client";

import { motion } from "motion/react";
import { spring } from "@/lib/motion";
import { NAV_SECTIONS } from "@/lib/site";

interface NavLinksProps {
  active: string | null;
  onNavigate?: () => void;
  layout: "row" | "stack";
}

/** Section links. The active one carries a shared `layoutId` indicator. */
export function NavLinks({ active, onNavigate, layout }: NavLinksProps) {
  const row = layout === "row";
  return (
    <ul className={row ? "flex items-center gap-1" : "flex flex-col gap-1"}>
      {NAV_SECTIONS.map((section) => {
        const isActive = active === section.id;
        return (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={onNavigate}
              aria-current={isActive ? "location" : undefined}
              className={`relative flex min-h-11 items-center rounded-control px-4 text-small font-medium transition-colors duration-150 hover:text-ink ${
                isActive ? "text-ink" : "text-muted"
              } ${row ? "" : "text-body"}`}
            >
              {isActive ? (
                <motion.span
                  layoutId={`nav-indicator-${layout}`}
                  transition={spring.snappy}
                  className="absolute inset-0 -z-10 rounded-control bg-sunken ring-1 ring-rule ring-inset"
                />
              ) : null}
              {section.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
