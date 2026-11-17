"use client";

import { motion } from "motion/react";
import type { WorkspaceIdentity } from "@/lib/account/session-settings";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { LogoImage } from "../brand/LogoImage";
import { CompanyMark } from "../avatar/CompanyMark";

const stagger = staggerGroup(0.07, 0.05);

/** The mark's slot at its largest (`sm:size-12`), in CSS px: phones draw it a little smaller. */
const MARK_PX = 48;

/** The logo's frame: the settings page's tile, smaller. */
const LOGO_FRAME = "overflow-hidden rounded-field bg-card shadow-seg ring-1 ring-line";

/**
 * The top of the Overview: whose workspace this is. Its logo filling a
 * rounded tile, or its default mark standing free in the same slot, beside
 * its name. The tile is decorative: the name says it.
 */
export function WorkspaceHeader({ name, logoSrc }: WorkspaceIdentity) {
  const reveal = useRevealVariants();
  const mark = <CompanyMark size={MARK_PX} testId="workspace-header-default" />;
  // A logo that won't load leaves its frame, which crops to its corners: the tile fit (85%)
  // keeps the bubble's tail clear of them, never clipped.
  const framedMark = <CompanyMark size={MARK_PX} fit="tile" testId="workspace-header-default" />;
  return (
    <motion.header
      variants={stagger}
      initial="hidden"
      animate="visible"
      data-testid="workspace-header"
      className="flex min-w-0 items-center gap-3 pt-2"
    >
      <motion.span
        variants={reveal}
        aria-hidden="true"
        data-testid="workspace-header-tile"
        className={`relative grid size-11 shrink-0 place-items-center sm:size-12 ${logoSrc ? LOGO_FRAME : ""}`}
      >
        {logoSrc ? (
          <LogoImage
            key={logoSrc}
            src={logoSrc}
            fallback={framedMark}
            testId="workspace-header-logo"
          />
        ) : (
          mark
        )}
      </motion.span>
      <motion.p
        variants={reveal}
        className="line-clamp-2 min-w-0 text-title font-bold tracking-tight break-words"
        data-testid="workspace-header-name"
      >
        {name}
      </motion.p>
    </motion.header>
  );
}
