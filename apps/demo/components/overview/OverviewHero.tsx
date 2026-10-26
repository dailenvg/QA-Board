"use client";

import { motion } from "motion/react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { useSquiggyMood } from "@/lib/squiggy/use-squiggy-mood";
import { Squiggy } from "../brand/mascot/Squiggy";
import { SquiggySpeechLine } from "./SquiggySpeechLine";

const MASCOT_SIZE = "clamp(6.5rem, 5rem + 5vw, 9rem)";

const stagger = staggerGroup(0.07, 0.05);

const COPY = {
  empty: {
    title: "Welcome to Squint",
    body: "Point at the exact spot on a website or image, say what should change, and resolve it once it's fixed.",
  },
  filled: {
    title: "Your projects at a glance",
    body: "Each folder shows its newest projects. Open one to see everything inside.",
  },
} as const;

interface OverviewHeroProps {
  /** No projects anywhere yet: a welcome instead of a summary. */
  empty: boolean;
}

/**
 * Squiggy and the headline (New project lives in the toolbar or, on narrow
 * screens, the sidebar, both above this). Squiggy's mood follows the
 * workspace (`useSquiggyMood`), and its line about it replaces the subline
 * when it has something specific to say.
 */
export function OverviewHero({ empty }: OverviewHeroProps) {
  const reveal = useRevealVariants();
  const squiggy = useSquiggyMood();
  const copy = empty ? COPY.empty : COPY.filled;

  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      data-testid="overview-hero"
      className="flex flex-col items-center gap-5 rounded-panel bg-panel px-6 py-8 text-center sm:flex-row sm:gap-8 sm:px-10 sm:text-left"
    >
      <motion.div
        variants={reveal}
        className="shrink-0"
        data-testid="squiggy"
        data-mood={squiggy.mood}
      >
        <Squiggy mood={squiggy.mood} size={MASCOT_SIZE} onPoke={squiggy.poke} />
      </motion.div>
      <div className="flex min-w-0 flex-col items-center gap-3 sm:items-start">
        <motion.p variants={reveal} className="label-caps text-brand-text">
          Overview
        </motion.p>
        <motion.h1 variants={reveal} className="text-display font-bold text-balance">
          {copy.title}
        </motion.h1>
        <motion.div variants={reveal}>
          <SquiggySpeechLine speech={squiggy.speech} fallback={copy.body} />
        </motion.div>
      </div>
    </motion.section>
  );
}
