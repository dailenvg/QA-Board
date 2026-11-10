"use client";

import { MotionConfig } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { StoryGlow } from "./StoryGlow";

interface StoryStageProps {
  /** A palette color for the panel's tint and glow. */
  tint: string;
  /** The finished frame: the scene's animations jump to their end. */
  still: boolean;
  /** The scene, positioned inside (`--tint` is its color). */
  children: ReactNode;
}

/**
 * The tinted 4:3 panel a story's scene plays on, with a soft glow behind it.
 * Decorative: whatever shows it says in words what happens.
 */
export function StoryStage({ tint, still, children }: StoryStageProps) {
  return (
    <span
      aria-hidden="true"
      style={{ "--tint": tint } as CSSProperties}
      className="relative isolate block aspect-[4/3] w-full overflow-hidden rounded-tile bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-panel))]"
    >
      <StoryGlow
        color={tint}
        className="top-[18%] left-[18%] size-[64%] opacity-40 dark:opacity-25"
      />
      {/* contents: the mock-ups keep the stage as their box, but draw light in dark mode. */}
      <span className="mock-light contents">
        <MotionConfig skipAnimations={still}>{children}</MotionConfig>
      </span>
    </span>
  );
}
