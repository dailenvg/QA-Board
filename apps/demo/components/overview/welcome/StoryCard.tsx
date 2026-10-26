"use client";

import { MotionConfig, motion, useInView } from "motion/react";
import { useRef, type CSSProperties } from "react";
import { useRevealVariants } from "@/lib/motion";
import type { StoryDefinition } from "./story-scene";
import { StoryGlow } from "./StoryGlow";
import { useStoryLoop } from "./use-story-loop";

/** How much of a card must be on screen for its story to play. */
const IN_VIEW = { amount: 0.4 } as const;

interface StoryCardProps {
  step: number;
  story: StoryDefinition;
  /** Start offset (ms), so the stories play in turn. */
  delay: number;
  /** Stories may play (not paused, tab visible, motion allowed). */
  running: boolean;
  /** Show the finished frame. */
  still: boolean;
  /** Spans two columns in the two-column bento, laying its scene beside its text. */
  wide?: boolean;
}

/**
 * One step of the welcome: an animated scene over its step number, title and
 * description. It explains rather than acts (the panel's button below opens
 * New project), so it has no hover lift or focus stop. Pointing at it plays
 * the story again from the top, a bonus only; it plays while on screen.
 */
export function StoryCard({ step, story, delay, running, still, wide = false }: StoryCardProps) {
  const reveal = useRevealVariants();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, IN_VIEW);
  const playing = running && inView;
  const { beat, replay } = useStoryLoop(story.beats.lengths, { playing, still, delay });
  const { Scene } = story;

  return (
    <motion.li variants={reveal} className={wide ? "@[34rem]:col-span-2 @[52rem]:col-span-1" : ""}>
      <motion.div
        ref={ref}
        onHoverStart={replay}
        data-testid="welcome-story"
        data-beat={beat}
        data-last-beat={story.beats.lengths.length - 1}
        data-playing={playing}
        className={`flex h-full flex-col gap-1 rounded-card bg-card p-2 shadow-seg ${
          wide ? "@[34rem]:grid @[34rem]:grid-cols-2 @[34rem]:items-center @[52rem]:flex" : ""
        }`}
      >
        <span
          aria-hidden="true"
          style={{ "--tint": story.tint } as CSSProperties}
          className="relative isolate block aspect-[4/3] w-full overflow-hidden rounded-tile bg-[color-mix(in_oklab,var(--tint)_14%,var(--color-panel))]"
        >
          <StoryGlow
            color={story.tint}
            className="top-[18%] left-[18%] size-[64%] opacity-40 dark:opacity-25"
          />
          <MotionConfig skipAnimations={still}>
            <Scene beat={beat} playing={playing} still={still} />
          </MotionConfig>
        </span>
        <div className="flex flex-col gap-1 p-3">
          <p className="label-caps text-brand-text">Step {step}</p>
          <h3 className="text-heading font-bold">{story.title}</h3>
          {/* text-body: 16px on phones, the mobile reading minimum. */}
          <p className="text-body text-muted">{story.body}</p>
        </div>
      </motion.div>
    </motion.li>
  );
}
