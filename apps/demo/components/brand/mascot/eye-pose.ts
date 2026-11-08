import type { EyeShape, MoodSpec } from "./moods";

type Gaze = { x: number; y: number };

/** Where the eyes are and what they do: shapes, a fixed gaze (null follows the pointer), blinks. */
export interface EyePose {
  /** Which layer set the eyes: picked up, politely not looking, or the mood's own. */
  source: "held" | "averted" | "mood";
  left: EyeShape;
  right: EyeShape;
  gaze: Gaze | null;
  blinks: boolean;
}

const OPEN: EyeShape = { scaleY: 1 };
/** Pressed shut, a touch wider than a blink, so it reads as on purpose. */
const SHUT: EyeShape = { scaleX: 1.06, scaleY: 0.1 };
const HELD_GAZE: Gaze = { x: 0, y: -6 };
/** Down and to the side; the body leans toward the gaze, so the head turns away too. */
export const AVERTED_GAZE: Gaze = { x: -18, y: 8 };

/**
 * The eyes, highest first: held (picked up, wide open and looking up), then
 * averted (shut and turned aside, not looking while a password is shown),
 * then the mood's own. Only the eyes: the body keeps the mood's motion.
 */
export function eyePose(
  spec: MoodSpec,
  { held, averted }: { held: boolean; averted: boolean },
): EyePose {
  if (held) return { source: "held", left: OPEN, right: OPEN, gaze: HELD_GAZE, blinks: false };
  if (averted) {
    return { source: "averted", left: SHUT, right: SHUT, gaze: AVERTED_GAZE, blinks: false };
  }
  return {
    source: "mood",
    left: spec.leftEye,
    right: spec.rightEye,
    gaze: spec.gaze,
    blinks: spec.blinks,
  };
}
