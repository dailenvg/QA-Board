"use client";

import { MotionConfig } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { StoryGlow } from "./StoryGlow";
import { StoryLookContext, type StoryLook } from "./story-look";

interface StoryStageProps {
  /** A palette color for the panel's tint and glow. */
  tint: string;
  /**
   * The tint is nearly white (resolved Mint), so 14% of it vanishes into the light panel:
   * there it takes half. Dark mode keeps 14%, where Mint already shows.
   */
  pale?: boolean;
  /** The finished frame: the scene's animations jump to their end. */
  still: boolean;
  /** The scene, positioned inside (`--tint` is its color). */
  children: ReactNode;
  /** Squint's colors, or its line art (`story-look.ts`). */
  look?: StoryLook;
}

/**
 * The tinted 4:3 panel a story's scene plays on, with a soft glow behind it.
 * Decorative: whatever shows it says in words what happens.
 */
export function StoryStage({
  tint,
  pale = false,
  still,
  children,
  look = "color",
}: StoryStageProps) {
  if (look === "line") {
    // No tint or glow, and no light mock-ups in dark mode: grey lines on the card itself.
    return (
      <span
        aria-hidden="true"
        data-look="line"
        style={{ "--tint": tint, "--art-surface": "var(--color-card)" } as CSSProperties}
        className="story-line relative isolate block aspect-[4/3] w-full overflow-hidden rounded-tile"
      >
        <StoryLookContext.Provider value="line">
          <MotionConfig skipAnimations={still}>{children}</MotionConfig>
        </StoryLookContext.Provider>
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ "--tint": tint } as CSSProperties}
      className={`relative isolate block aspect-[4/3] w-full overflow-hidden rounded-tile ${
        pale
          ? "bg-[color-mix(in_oklab,var(--tint)_50%,var(--color-panel))] dark:bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-panel))]"
          : "bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-panel))]"
      }`}
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
