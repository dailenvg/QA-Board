"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { IconName } from "../ui/Icon";
import { NavRow } from "./NavRow";

/** One section of a settings-style area (the account settings, the admin panel). */
export interface NavSection {
  href: string;
  label: string;
  icon: IconName;
  /** Open on its own path only, not under it (an area's first page, whose path prefixes the rest). */
  exact?: boolean;
}

interface SectionNavProps {
  sections: readonly NavSection[];
  /** The nav's accessible name. */
  label: string;
  /** The active background's `layoutId`, its own per area. */
  indicatorId: string;
  testId?: string;
}

function isOpen(section: NavSection, pathname: string): boolean {
  if (pathname === section.href) return true;
  return !section.exact && pathname.startsWith(`${section.href}/`);
}

/**
 * An area's sections: a row of tabs on narrow screens, a list beside the page
 * on wide ones. One active background glides between them. On a phone the row
 * scrolls sideways, so the open section's tab is brought into view (the last
 * would otherwise sit cut off at the edge).
 */
export function SectionNav({ sections, label, indicatorId, testId }: SectionNavProps) {
  const pathname = usePathname();
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = list.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !active) return;
    // The row's own scroll only, centering the tab: scrollIntoView could move the page too.
    const bounds = row.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < bounds.left || tab.right > bounds.right) {
      row.scrollLeft += tab.left - bounds.left - (bounds.width - tab.width) / 2;
    }
  }, [pathname]);
  return (
    <nav aria-label={label} data-testid={testId}>
      {/*
        On a panel, as in the sidebar, so the active tint reads the same in both. p-2 keeps the
        rows' focus rings inside the scroll box, which would clip them.
      */}
      <ul ref={list} className="flex gap-2 overflow-x-auto rounded-panel bg-panel p-2 lg:flex-col">
        {sections.map((section) => (
          <li key={section.href} className="shrink-0">
            <NavRow
              href={section.href}
              icon={section.icon}
              label={section.label}
              active={isOpen(section, pathname)}
              indicatorId={indicatorId}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
