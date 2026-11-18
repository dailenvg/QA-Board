"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Logo } from "../brand/Logo";
import { StateArt } from "../ui/line-art/StateArt";

const COPY = {
  gone: {
    title: "This link isn't available",
    body: "The project owner may have revoked it, or the address is incomplete. Ask them for a new link. Links also stop working 30 days after the project was created.",
  },
  paused: {
    title: "This review isn't available right now.",
    body: "Comments can't be added for now. Try again later, or ask the person who sent you the link.",
  },
} as const;

interface ShareUnavailableProps {
  /**
   * The link still exists, but its workspace is suspended: the review is
   * paused, not gone, and opens again once that's lifted. Says nothing of why.
   */
  paused?: boolean;
}

/** A shared link that doesn't open (unknown, revoked, or paused). No way into anyone's workspace. */
export function ShareUnavailable({ paused = false }: ShareUnavailableProps) {
  const variants = useRevealVariants();
  const copy = paused ? COPY.paused : COPY.gone;
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        data-testid="share-unavailable"
        data-paused={paused || undefined}
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center"
      >
        <StateArt scene={paused ? "slow" : "brokenLink"} />
        <div>
          <h1 className="text-title font-bold">{copy.title}</h1>
          <p className="mt-2 text-body text-muted">{copy.body}</p>
        </div>
        <Logo linked={false} caption="Visual review" />
      </motion.section>
    </main>
  );
}
