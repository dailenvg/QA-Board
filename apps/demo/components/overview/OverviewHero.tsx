"use client";

import { motion } from "motion/react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { SquintMascot } from "../brand/mascot/SquintMascot";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";

/** How long the mascot stays happy after saying hello (on arrival, or when poked). */
const GREETING_MS = 1600;
const MASCOT_SIZE = "clamp(6.5rem, 5rem + 5vw, 9rem)";

const stagger = staggerGroup(0.07, 0.05);

const COPY = {
  empty: {
    title: "Welcome to Squint",
    body: "Point at the exact spot on a website or image, say what should change, and resolve it once it's fixed.",
  },
  filled: {
    title: "Everything up for review",
    body: "Each folder shows its newest projects. Open one to see everything inside.",
  },
} as const;

interface OverviewHeroProps {
  /** No projects anywhere yet: a welcome instead of a summary. */
  empty: boolean;
  onNewProject: () => void;
}

/** Mascot, headline and the primary action. The mascot greets on arrival and follows the cursor. */
export function OverviewHero({ empty, onNewProject }: OverviewHeroProps) {
  const reveal = useRevealVariants();
  const [greeting, greet] = useTimedFlag(GREETING_MS, true);
  const copy = empty ? COPY.empty : COPY.filled;

  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      data-testid="overview-hero"
      className="flex flex-col items-center gap-5 rounded-panel bg-panel px-6 py-8 text-center sm:flex-row sm:gap-8 sm:px-10 sm:text-left"
    >
      <motion.div variants={reveal} className="shrink-0">
        <SquintMascot mood={greeting ? "happy" : "idle"} size={MASCOT_SIZE} onPoke={greet} />
      </motion.div>
      <div className="flex min-w-0 flex-col items-center gap-3 sm:items-start">
        <motion.p variants={reveal} className="label-caps text-brand-text">
          Overview
        </motion.p>
        <motion.h1 variants={reveal} className="text-display font-bold text-balance">
          {copy.title}
        </motion.h1>
        <motion.p variants={reveal} className="max-w-xl text-nav text-muted">
          {copy.body}
        </motion.p>
        <motion.div variants={reveal} className="pt-2">
          <Button onClick={onNewProject} title="New project (N)" data-testid="overview-new-project">
            <Icon name="plus" className="size-5" />
            New project
            <Kbd className="border-on-brand/40 text-on-brand/80 max-md:hidden">N</Kbd>
          </Button>
        </motion.div>
      </div>
    </motion.section>
  );
}
