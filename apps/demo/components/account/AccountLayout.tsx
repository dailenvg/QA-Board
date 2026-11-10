"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { AccountSection } from "@/lib/account/sections";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { AccountNav } from "./AccountNav";

interface AccountLayoutProps {
  sections: readonly AccountSection[];
  children: ReactNode;
  /** Under the nav on wide screens (who is signed in, for an account with no sidebar). */
  aside?: ReactNode;
}

const GROUP = staggerGroup();

/** The account settings: title and section nav, then the open section. */
export function AccountLayout({ sections, children, aside = null }: AccountLayoutProps) {
  const variants = useRevealVariants();
  const hasWorkspace = sections.some((section) => section.needsWorkspace);
  return (
    <motion.div
      variants={GROUP}
      initial="hidden"
      animate="visible"
      className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-8"
    >
      <motion.div
        variants={variants}
        className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:w-64 lg:shrink-0"
      >
        <div className="flex flex-col gap-1 px-2">
          <h1 className="text-display font-bold">Account</h1>
          <p className="text-body text-muted" data-testid="account-summary">
            {hasWorkspace
              ? "Your profile, how you sign in, your workspace and its storage."
              : "Your profile and how you sign in."}
          </p>
        </div>
        <AccountNav sections={sections} />
        {aside}
      </motion.div>
      <motion.div variants={variants} className="flex max-w-2xl min-w-0 flex-1 flex-col">
        {children}
      </motion.div>
    </motion.div>
  );
}
