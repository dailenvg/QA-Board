"use client";

import type { AccountSection } from "@/lib/account/sections";
import { SectionNav } from "../dashboard/SectionNav";

/** The account settings' sections, with their own gliding indicator. */
export function AccountNav({ sections }: { sections: readonly AccountSection[] }) {
  return (
    <SectionNav
      sections={sections}
      label="Account settings"
      indicatorId="account-section-indicator"
      testId="account-nav"
    />
  );
}
