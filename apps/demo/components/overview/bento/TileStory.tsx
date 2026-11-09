"use client";

import { useInView } from "motion/react";
import { useRef } from "react";
import type { StoryDefinition } from "../welcome/story-scene";
import { StoryStage } from "../welcome/StoryStage";
import { useStoryLoop } from "../welcome/use-story-loop";
import type { StoryPlayback } from "../welcome/use-story-playback";

/** How much of the scene must be on screen for it to play, as the welcome's stories. */
const IN_VIEW = { amount: 0.4 } as const;

interface TileStoryProps {
  story: Pick<StoryDefinition, "tint" | "beats" | "Scene">;
  playback: StoryPlayback;
  /** There's something for the story to point at; otherwise it holds its finished frame. */
  live: boolean;
}

/**
 * One of the welcome's story scenes, small, inside a tile: it loops while
 * it's on screen and there's news to point at, under the same Pause and
 * reduced-motion rules as the welcome (a still frame otherwise).
 */
export function TileStory({ story, playback, live }: TileStoryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, IN_VIEW);
  const still = playback.still || !live;
  const playing = playback.running && live && inView;
  const { beat } = useStoryLoop(story.beats.lengths, { playing, still });
  const { Scene } = story;
  return (
    <div ref={ref} data-testid="tile-story" data-playing={playing} data-beat={beat}>
      <StoryStage tint={story.tint} still={still}>
        <Scene beat={beat} playing={playing} still={still} />
      </StoryStage>
    </div>
  );
}
