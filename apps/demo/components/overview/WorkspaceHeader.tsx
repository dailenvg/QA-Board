"use client";

import { motion } from "motion/react";
import type { WorkspaceIdentity } from "@/lib/account/session-settings";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { LogoImage } from "../brand/LogoImage";
import { MonogramTile } from "../brand/MonogramTile";

const stagger = staggerGroup(0.07, 0.05);

/**
 * The top of the Overview: whose workspace this is. Its logo filling a
 * rounded tile (the settings page's tile, smaller), or its monogram on its
 * brand color, beside its name. The tile is decorative: the name says it.
 */
export function WorkspaceHeader({ name, brandColor, logoSrc }: WorkspaceIdentity) {
  const reveal = useRevealVariants();
  const monogram = (
    <MonogramTile
      name={name}
      color={brandColor}
      className="size-full text-heading"
      testId="workspace-header-monogram"
    />
  );
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
        className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-field bg-card shadow-seg ring-1 ring-line sm:size-12"
      >
        {logoSrc ? (
          <LogoImage
            key={logoSrc}
            src={logoSrc}
            fallback={monogram}
            testId="workspace-header-logo"
          />
        ) : (
          monogram
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
