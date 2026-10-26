"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { duration, ease, spring } from "@/lib/motion";
import { Squiggy } from "../../brand/mascot/Squiggy";
import type { Mood } from "../../brand/mascot/moods";

/**
 * The edge Squiggy peeks in from. Each story uses its own spot (and Pin and
 * Resolve bring it in at their key beat), so the three cards don't repeat
 * one pose; every spot stays clear of the story's key action.
 */
export type MascotEdge = "bottom-right" | "left";

const PLACEMENT: Record<MascotEdge, string> = {
  "bottom-right": "-bottom-3 right-[4%]",
  left: "-left-4 bottom-[4%]",
};

/** Leaning in from the left edge; upright when peeking over the bottom. */
const LEAN: Record<MascotEdge, number> = { "bottom-right": 0, left: 10 };

const OUT: Record<MascotEdge, { x?: string; y?: string }> = {
  "bottom-right": { y: "75%" },
  left: { x: "-75%" },
};

function peekVariants(edge: MascotEdge): Variants {
  return {
    hidden: { ...OUT[edge], opacity: 0 },
    visible: { x: 0, y: 0, opacity: 1, transition: spring.soft },
    exit: {
      ...OUT[edge],
      opacity: 0,
      transition: { duration: duration.component, ease: ease.out },
    },
  };
}

const PEEK: Record<MascotEdge, Variants> = {
  "bottom-right": peekVariants("bottom-right"),
  left: peekVariants("left"),
};

interface StoryMascotProps {
  mood: Mood;
  /** The story is running. Paused, offscreen or reduced motion: the eyes stay open too. */
  playing: boolean;
  /** Holds the mood's pose instead of looping it. */
  still: boolean;
  edge?: MascotEdge;
  size?: string;
  /** Squiggy is in the scene; false slides it back out past its edge. */
  show?: boolean;
}

/**
 * Squiggy peeking into a scene from one edge, reacting to the story.
 * Decorative: the story's text says what happens.
 */
export function StoryMascot({
  mood,
  playing,
  still,
  edge = "bottom-right",
  size = "4rem",
  show = true,
}: StoryMascotProps) {
  const reduce = useReducedMotion() ?? false;
  // A held frame holds fully still: no blinks either (WCAG 2.2.2).
  const blinks = playing && !reduce;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          key="mascot"
          className={`pointer-events-none absolute block ${PLACEMENT[edge]}`}
          style={{ rotate: LEAN[edge] }}
          variants={PEEK[edge]}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-testid="story-mascot"
          data-blinks={blinks}
        >
          <Squiggy
            mood={mood}
            size={size}
            followCursor={false}
            still={still}
            blinks={blinks}
            as="span"
          />
        </motion.span>
      )}
    </AnimatePresence>
  );
}
