"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { SectionNav } from "../dashboard/SectionNav";
import { ADMIN_COPY } from "./admin-copy";

interface AdminLayoutProps {
  children: ReactNode;
  /** Under the nav on wide screens: who is signed in, with Sign out. */
  aside: ReactNode;
}

const GROUP = staggerGroup();

/** The admin panel: title and section nav, then the open section. */
export function AdminLayout({ children, aside }: AdminLayoutProps) {
  const variants = useRevealVariants();
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
          <h1 className="text-display font-bold">{ADMIN_COPY.title}</h1>
          <p className="text-body text-muted">{ADMIN_COPY.summary}</p>
        </div>
        <SectionNav
          sections={ADMIN_SECTIONS}
          label={ADMIN_COPY.nav}
          indicatorId="admin-section-indicator"
          testId="admin-nav"
        />
        {aside}
      </motion.div>
      <motion.div variants={variants} className="flex min-w-0 flex-1 flex-col">
        {children}
      </motion.div>
    </motion.div>
  );
}
