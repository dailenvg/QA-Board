import type { Easing, Transition, Variants } from "framer-motion";
import { duration, ease, spring } from "../lib/motion";

/** Length of one Resolved hop; the confetti and badge in MoodProps key off it. */
export const RESOLVED_HOP = 1.2;
/** When the hop peaks, measured from the moment the mood is set. */
export const RESOLVED_APEX = duration.micro + RESOLVED_HOP * 0.42;

export const MOODS = [
  "idle",
  "listening",
  "thinking",
  "talking",
  "happy",
  "surprised",
  "sleeping",
  "resolved",
  "searching",
] as const;

export type Mood = (typeof MOODS)[number];

/** A layer pose: each prop is a static value or a loop of keyframes starting at rest. */
type Pose = Record<string, number | number[]>;

export type EyeShape = { scaleX?: number; scaleY: number; rotate?: number };

/** Something the mascot can hold. */
export type Accessory = "magnifier";

export type MoodSpec = {
  label: string;
  /** Whole-body travel: hops, bobbing, tilt. */
  float: Pose;
  /** Squash and stretch, anchored to the ground. */
  squash: Pose;
  /** Both eyes together: lift and size. */
  eyes: Pose;
  /** Ground shadow, reacts to float height. */
  shadow: Pose;
  leftEye: EyeShape;
  rightEye: EyeShape;
  /** Fixed gaze in SVG units, or null to follow the pointer. */
  gaze: { x: number; y: number } | null;
  blinks: boolean;
  /** Loop timing. Omit for a held pose. */
  loop?: { duration: number; ease: Easing | Easing[]; times?: number[]; repeatDelay?: number };
  /** How the pose is entered. */
  enter?: Transition;
  /** Held while in this mood. */
  accessory?: Accessory;
};

const open: EyeShape = { scaleY: 1 };

export const MOOD_SPECS: Record<Mood, MoodSpec> = {
  idle: {
    label: "Idle",
    float: { y: [0, -10, 0], rotate: 0 },
    squash: { scaleX: [1, 0.994, 1], scaleY: [1, 1.012, 1] },
    eyes: { y: 0, scale: 1 },
    shadow: { scaleX: [1, 0.86, 1], opacity: [0.22, 0.14, 0.22] },
    leftEye: open,
    rightEye: open,
    gaze: null,
    blinks: true,
    loop: { duration: 3.2, ease: ease.breathe },
  },
  listening: {
    label: "Listening",
    float: { y: [-6, -10, -6], rotate: 3 },
    squash: { scaleX: 0.99, scaleY: 1.02 },
    eyes: { y: -4, scale: 1.08 },
    shadow: { scaleX: [0.92, 0.86, 0.92], opacity: 0.16 },
    leftEye: open,
    rightEye: open,
    gaze: null,
    blinks: true,
    loop: { duration: 2.2, ease: ease.breathe },
  },
  thinking: {
    label: "Thinking",
    float: { y: [0, -6, 0], rotate: -5 },
    squash: { scaleX: 1, scaleY: 1 },
    eyes: { y: -2, scale: 1 },
    shadow: { scaleX: [1, 0.92, 1], opacity: 0.2 },
    // The signature squint: one eye narrows more than the other.
    leftEye: { scaleY: 0.6, rotate: -4 },
    rightEye: { scaleY: 0.92 },
    gaze: { x: 16, y: -14 },
    blinks: true,
    loop: { duration: 2.6, ease: ease.breathe },
  },
  talking: {
    label: "Talking",
    float: { y: [0, -3, 0, -2, 0], rotate: 0 },
    squash: { scaleX: [1, 0.97, 1.02, 0.985, 1], scaleY: [1, 1.045, 0.975, 1.03, 1] },
    eyes: { y: [0, -3, 0, -2, 0], scale: 1 },
    shadow: { scaleX: [1, 0.96, 1.02, 0.97, 1], opacity: 0.22 },
    leftEye: open,
    rightEye: open,
    gaze: null,
    blinks: true,
    loop: { duration: 0.9, ease: "easeInOut" },
  },
  happy: {
    label: "Happy",
    // Anticipation squash, launch, fall, landing squash.
    float: { y: [0, 0, -36, 0, 0], rotate: [0, 0, 4, 0, 0] },
    squash: { scaleX: [1, 1.12, 0.92, 1.1, 1], scaleY: [1, 0.88, 1.08, 0.9, 1] },
    eyes: { y: -8, scale: 1 },
    shadow: { scaleX: [1, 1.05, 0.6, 1.05, 1], opacity: [0.22, 0.24, 0.1, 0.24, 0.22] },
    leftEye: { scaleY: 0.48 },
    rightEye: { scaleY: 0.48 },
    gaze: null,
    blinks: false,
    loop: {
      duration: 1.15,
      times: [0, 0.15, 0.5, 0.85, 1],
      ease: ["easeOut", "easeOut", "easeIn", "easeOut"],
    },
  },
  surprised: {
    label: "Surprised",
    float: { y: [-18, -21, -18], rotate: 0 },
    squash: { scaleX: 0.95, scaleY: 1.07 },
    eyes: { y: -6, scale: 1.22 },
    shadow: { scaleX: 0.8, opacity: 0.14 },
    leftEye: open,
    rightEye: open,
    gaze: { x: 0, y: -4 },
    blinks: false,
    loop: { duration: 1.6, ease: ease.breathe },
    enter: spring.jelly,
  },
  sleeping: {
    label: "Sleeping",
    float: { y: [4, 8, 4], rotate: 7 },
    squash: { scaleX: [1.02, 1, 1.02], scaleY: [0.97, 1, 0.97] },
    eyes: { y: 12, scale: 1 },
    shadow: { scaleX: [1.04, 1, 1.04], opacity: 0.22 },
    leftEye: { scaleY: 0.12 },
    rightEye: { scaleY: 0.12 },
    gaze: { x: -4, y: 10 },
    blinks: false,
    loop: { duration: 4.2, ease: ease.breathe },
  },
  resolved: {
    label: "Resolved",
    // Celebration hop: crouch, leap with a wiggle, land, small rebound, then a beat of rest.
    float: { y: [0, 4, -54, 0, -6, 0], rotate: [0, 0, -7, 5, 0, 0] },
    squash: { scaleX: [1, 1.14, 0.9, 1.12, 0.98, 1], scaleY: [1, 0.86, 1.1, 0.88, 1.02, 1] },
    eyes: { y: -8, scale: 1 },
    shadow: { scaleX: [1, 1.06, 0.55, 1.08, 0.95, 1], opacity: [0.22, 0.24, 0.08, 0.24, 0.2, 0.22] },
    // Joy squint: eyes press shut and tip toward each other.
    leftEye: { scaleX: 1.08, scaleY: 0.4, rotate: -6 },
    rightEye: { scaleX: 1.08, scaleY: 0.4, rotate: 6 },
    gaze: { x: 0, y: -8 },
    blinks: false,
    loop: {
      duration: RESOLVED_HOP,
      times: [0, 0.14, 0.42, 0.72, 0.86, 1],
      ease: ["easeOut", "easeOut", "easeIn", "easeOut", "easeInOut"],
      repeatDelay: RESOLVED_HOP,
    },
    // Snap into the crouch so the props below can sync to the hop.
    enter: { duration: duration.micro, ease: ease.out },
  },
  searching: {
    label: "Searching",
    // Peers through the lens one way, then the other, leaning into each look.
    float: { y: [-4, -7, -7, -5, -5, -4], rotate: [0, 3, 3, -3, -3, 0] },
    squash: { scaleX: 0.99, scaleY: 1.02 },
    eyes: { x: [0, 16, 16, -14, -14, 0], y: [-3, -6, -6, -1, -1, -3], scale: 1 },
    shadow: { scaleX: 0.92, opacity: 0.18 },
    // The free eye narrows a touch while the other looks through the glass. Only a touch:
    // at folder-key size (about 60px) anything flatter reads as a dash, not an eye.
    leftEye: { scaleY: 0.84, rotate: -3 },
    rightEye: open,
    gaze: null,
    blinks: true,
    loop: {
      duration: 3.6,
      times: [0, 0.16, 0.42, 0.58, 0.84, 1],
      ease: ease.breathe,
    },
    accessory: "magnifier",
  },
};

export type Layer = "float" | "squash" | "eyes" | "shadow";

const restOf = (pose: Pose) =>
  Object.fromEntries(
    Object.entries(pose).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

/** Values only some moods animate, so every other mood returns them to rest. */
const LAYER_REST: Partial<Record<Layer, Pose>> = { eyes: { x: 0 } };

/**
 * Each mood gets two variants per layer:
 * `<mood>:enter` springs to the loop's first frame so mood changes never jump,
 * `<mood>:loop` then runs the keyframes forever.
 */
export function layerVariants(layer: Layer): Variants {
  const variants: Variants = {};
  for (const mood of MOODS) {
    const spec = MOOD_SPECS[mood];
    const pose = spec[layer];
    variants[`${mood}:enter`] = { ...LAYER_REST[layer], ...restOf(pose), transition: spec.enter ?? spring.pose };
    if (spec.loop) {
      variants[`${mood}:loop`] = {
        ...pose,
        transition: { ...spec.loop, repeat: Infinity },
      };
    }
  }
  return variants;
}
