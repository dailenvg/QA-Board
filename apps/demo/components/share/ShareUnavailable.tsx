"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Logo } from "../brand/Logo";
import { SquintMascot } from "../brand/mascot/SquintMascot";

/** A shared link that doesn't open (unknown or revoked). No way into anyone's workspace. */
export function ShareUnavailable() {
  const variants = useRevealVariants();
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        data-testid="share-unavailable"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center"
      >
        <SquintMascot mood="thinking" size={120} />
        <div>
          <h1 className="text-title font-bold">This link isn&apos;t available</h1>
          <p className="mt-2 text-body text-muted">
            The project owner may have revoked it, or the address is incomplete. Ask them for a new
            link.
          </p>
        </div>
        <Logo linked={false} caption="Visual review" />
      </motion.section>
    </main>
  );
}
