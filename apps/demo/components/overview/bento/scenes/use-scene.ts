import { useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { tally } from "@/lib/motion";
import { useIsClient } from "@/lib/use-is-client";

export interface Scene {
  /**
   * Draw the scene: on screen once, or with reduced motion its final frame at once (right
   * after hydration: the server can't know the preference, so both render it empty first).
   */
  shown: boolean;
  /** Bumped on each replay: the scene remounts under this key, so it plays again. */
  run: number;
  /** Reduced motion: final frames only, never a replay. */
  still: boolean;
  /** Plays the scene again (hover or focus on its card), unless it's still playing. */
  replay: () => void;
}

/**
 * A card's illustrated scene: one play when it comes on screen, one more
 * whenever its card is hovered or focused (not while a play is still under
 * way), never a loop. Reduced motion shows the final frame and never replays.
 */
export function useScene(): [RefObject<HTMLDivElement | null>, Scene] {
  const still = useReducedMotion() ?? false;
  const hydrated = useIsClient();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [run, setRun] = useState(0);
  const playedAt = useRef(0);

  useEffect(() => {
    if (inView) playedAt.current = Date.now();
  }, [inView]);

  const replay = useCallback(() => {
    if (still || !inView || Date.now() - playedAt.current < tally * 1000) return;
    playedAt.current = Date.now();
    setRun((count) => count + 1);
  }, [still, inView]);

  // The ref apart from the state, so rendering reads only plain values: the ref goes on the
  // scene's box (`SceneBox`), which plays once 30% of it is on screen.
  return [ref, { shown: inView || (still && hydrated), run, still, replay }];
}
