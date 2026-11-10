"use client";

import { MotionConfig, useInView, useReducedMotion } from "motion/react";
import { useRef, type CSSProperties } from "react";
import type { CommenterColor } from "@/lib/brand-palette";
import { staggerStep } from "@/lib/motion";
import { MockPage } from "../welcome/MockPage";
import { MockPin } from "../welcome/MockPin";
import { STORY_COMMENTER } from "../welcome/story-script";
import { StoryGlow } from "../welcome/StoryGlow";

/** Where pins land on the page, in % of it: spread out, clear of each other. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [22, 30],
  [64, 24],
  [42, 54],
  [80, 50],
  [28, 78],
  [62, 80],
];

/** The most pins the board shows; more news still shows in the count. */
export const BOARD_PINS = SPOTS.length;

interface PinBoardProps {
  /** One color per pin, in drop order (each project's comments in its color). */
  pins: readonly CommenterColor[];
}

/**
 * Clients' new comments as pins dropping onto a page, one after another, the
 * first time the board is on screen: the welcome's Pin story, cut down to its
 * key beat. Once, not a loop; already landed with reduced motion. Decorative:
 * the count and rows beside it say the same in words.
 */
export function PinBoard({ pins }: PinBoardProps) {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="pin-board"
      data-pins={pins.length}
      style={{ "--tint": STORY_COMMENTER.hex } as CSSProperties}
      className="relative isolate block size-full min-h-24 overflow-hidden rounded-tile bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-panel))]"
    >
      <StoryGlow
        color={STORY_COMMENTER.hex}
        className="top-[18%] left-[18%] size-[64%] opacity-40 dark:opacity-25"
      />
      <MotionConfig skipAnimations={reduce}>
        <MockPage>
          {inView || reduce
            ? pins.slice(0, BOARD_PINS).map((color, index) => {
                const [x, y] = SPOTS[index] ?? [50, 50];
                return (
                  <span
                    key={index}
                    className="absolute block size-0"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <MockPin color={color} number={index + 1} delay={index * staggerStep * 2} />
                  </span>
                );
              })
            : null}
        </MockPage>
      </MotionConfig>
    </span>
  );
}
