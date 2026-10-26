import { useEffect, useMemo, useRef, useState } from "react";
import type { Mood } from "@/components/brand/mascot/moods";
import { useSquint } from "../store/use-squint";
import { useTimedFlag } from "../use-timed-flag";
import { useActivity } from "./activity";
import { useSquiggyAttention } from "./attention";
import {
  ambientMood,
  ATTENTION_RELEASE_MS,
  ATTENTION_SETTLE_MS,
  attentionMood,
  dwellRemaining,
  POKE_MS,
  reactionMood,
  resolveMood,
  squiggySummary,
} from "./mood-engine";
import { useSquiggyReaction } from "./reaction";
import { currentSpeech, type SquiggySpeech } from "./speech";

export interface SquiggyMood {
  mood: Mood;
  /** A reaction's line while it lasts, else what Squiggy has to say about the workspace, or null. */
  speech: SquiggySpeech | null;
  /** For `onPoke`: a happy wink for `POKE_MS`. */
  poke: () => void;
}

/**
 * `value`, but each value stays at least `AMBIENT_DWELL_MS` before the next
 * replaces it, so quick changes don't make the mood flicker.
 */
function useDwell<T>(value: T): T {
  const [shown, setShown] = useState(value);
  const since = useRef(0);

  useEffect(() => {
    since.current = Date.now();
  }, [shown]);

  useEffect(() => {
    if (Object.is(value, shown)) return;
    const timer = window.setTimeout(
      () => setShown(value),
      dwellRemaining(since.current, Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [value, shown]);

  return shown;
}

/**
 * `value` once it has held for `onDelay` (when it turns true) or `offDelay`
 * (when it turns false). Brief blips in either direction never show.
 */
function useSettled(value: boolean, onDelay: number, offDelay: number): boolean {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (value === shown) return;
    const timer = window.setTimeout(() => setShown(value), value ? onDelay : offDelay);
    return () => window.clearTimeout(timer);
  }, [value, shown, onDelay, offDelay]);

  return shown;
}

/** The main Squiggy's mood (see `mood-engine.ts` for the layers), and its speech line. */
export function useSquiggyMood(): SquiggyMood {
  const state = useSquint();
  const summary = useMemo(
    () => (state.status === "ready" ? squiggySummary(state.data) : null),
    [state],
  );
  const { engaged, asleep } = useActivity();
  const listening = useSettled(useSquiggyAttention(), ATTENTION_SETTLE_MS, ATTENTION_RELEASE_MS);
  const reaction = useSquiggyReaction();
  const [poked, poke] = useTimedFlag(POKE_MS);
  const ambient = useDwell<Mood>(summary ? ambientMood(summary, engaged) : "idle");

  return {
    mood: resolveMood({
      reaction: reaction ? reactionMood(reaction) : null,
      attention: attentionMood({ poked, listening }),
      ambient,
      asleep,
    }),
    speech: currentSpeech(reaction, summary),
    poke,
  };
}
