"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Squiggy } from "../brand/mascot/Squiggy";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

/** Unknown or deleted project id. */
export function ViewerNotFound() {
  const variants = useRevealVariants();
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        data-testid="project-not-found"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center"
      >
        <Squiggy mood="thinking" size={120} />
        <div>
          <h1 className="text-title font-bold">We can&apos;t find that project</h1>
          <p className="mt-2 text-body text-muted">
            It may have been deleted, or it was made in a different browser. Projects are saved only
            in the browser where they were created.
          </p>
        </div>
        <ButtonLink href="/">
          <Icon name="chevronLeft" className="size-5" />
          Back to Overview
        </ButtonLink>
      </motion.section>
    </main>
  );
}
