"use client";

import { usePathname } from "next/navigation";
import type { AccountSection } from "@/lib/account/sections";
import { NavRow } from "../dashboard/NavRow";

/**
 * The account settings' sections: a row of tabs on narrow screens, a list
 * beside the page on wide ones. One active background glides between them.
 */
export function AccountNav({ sections }: { sections: readonly AccountSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account settings" data-testid="account-nav">
      <ul className="flex gap-2 overflow-x-auto lg:flex-col">
        {sections.map((section) => (
          <li key={section.href} className="shrink-0">
            <NavRow
              href={section.href}
              icon={section.icon}
              label={section.label}
              active={pathname === section.href || pathname.startsWith(`${section.href}/`)}
              indicatorId="account-section-indicator"
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
