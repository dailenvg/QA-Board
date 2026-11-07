"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { Squiggy } from "../brand/mascot/Squiggy";

const GROUP = staggerGroup();

/**
 * Signed in, but not a member of any workspace (the admin, for now): an empty
 * state, not an error. `account` is who is signed in, with Sign out.
 */
export function NoWorkspace({ account }: { account: ReactNode }) {
  const variants = useRevealVariants();
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={GROUP}
        initial="hidden"
        animate="visible"
        data-testid="no-workspace"
        aria-labelledby="no-workspace-title"
        className="flex w-full max-w-md flex-col items-center gap-5 rounded-panel bg-panel px-6 py-10 text-center"
      >
        <motion.div variants={variants}>
          <Squiggy mood="sleeping" size={120} followCursor={false} />
        </motion.div>
        <motion.div variants={variants}>
          <h1 id="no-workspace-title" className="text-title font-bold">
            No workspace yet
          </h1>
          <p className="mt-2 text-body text-muted">
            This account isn&apos;t part of a workspace, so there are no folders or projects to
            show. Workspace accounts see theirs here.
          </p>
        </motion.div>
        <motion.div variants={variants} className="w-full">
          {account}
        </motion.div>
      </motion.section>
    </main>
  );
}
