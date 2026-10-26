import { useCallback, useEffect, useState } from "react";
import { createStoryClock } from "./story-clock";

interface StoryLoopOptions {
  /** Advance the beats. False holds the current beat (offscreen, tab hidden, paused). */
  playing: boolean;
  /** Show the finished frame and hold it: reduced motion, or paused before it ever played. */
  still: boolean;
  /** Start offset (ms) before the first beat ends. */
  delay?: number;
}

interface StoryLoop {
  beat: number;
  /** Plays the story again from its first beat, if it's playing at all. */
  replay: () => void;
}

/**
 * The current beat of a looping story. `lengths` and `delay` are read once, on
 * mount: pass constants (see story-script.ts).
 */
export function useStoryLoop(
  lengths: readonly number[],
  { playing, still, delay = 0 }: StoryLoopOptions,
): StoryLoop {
  const last = lengths.length - 1;
  const [beat, setBeat] = useState(() => (still ? last : 0));
  const [clock] = useState(() => createStoryClock({ beats: lengths, delay, onBeat: setBeat }));

  useEffect(() => {
    if (still) clock.settle();
    else if (playing) clock.play();
    return () => clock.pause();
  }, [clock, playing, still]);

  const replay = useCallback(() => {
    if (playing && !still) clock.restart();
  }, [clock, playing, still]);

  return { beat: still ? last : beat, replay };
}
