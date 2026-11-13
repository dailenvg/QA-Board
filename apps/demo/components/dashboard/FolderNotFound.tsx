"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { OVERVIEW_HREF } from "@/lib/routes";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { StateArt } from "../ui/line-art/StateArt";

/** Unknown or deleted folder id, inside the workspace so the sidebar stays in reach. */
export function FolderNotFound() {
  const variants = useRevealVariants();
  return (
    <motion.section
      variants={variants}
      initial="hidden"
      animate="visible"
      data-testid="folder-not-found"
      className="grid flex-1 place-items-center rounded-panel bg-tile px-6 py-14 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <StateArt scene="missingFolder" surface="tile" />
        <div>
          <h1 className="text-title font-bold">We can&apos;t find that folder</h1>
          <p className="mt-2 text-body text-muted">
            It may have been deleted, or your account may not have access to it.
          </p>
        </div>
        <ButtonLink href={OVERVIEW_HREF}>
          <Icon name="chevronLeft" className="size-5" />
          Back to Overview
        </ButtonLink>
      </div>
    </motion.section>
  );
}
