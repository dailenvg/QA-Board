import type { Transition } from "framer-motion";

type Bezier = [number, number, number, number];

/** Shared motion tokens. Import these instead of inlining numbers. */
export const duration = {
  micro: 0.18,
  component: 0.32,
  page: 0.5,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as Bezier,
  inOut: [0.65, 0, 0.35, 1] as Bezier,
  breathe: [0.45, 0, 0.55, 1] as Bezier,
};

export const spring = {
  ui: { type: "spring", stiffness: 260, damping: 26 },
  pose: { type: "spring", stiffness: 220, damping: 24 },
  eye: { type: "spring", stiffness: 300, damping: 26 },
  jelly: { type: "spring", stiffness: 420, damping: 14 },
  flip: { type: "spring", stiffness: 380, damping: 28 },
} satisfies Record<string, Transition>;

/** Spring options for useSpring (no `type` key). */
export const springValue = {
  gaze: { stiffness: 200, damping: 22, mass: 0.6 },
  swing: { stiffness: 160, damping: 12, mass: 0.8 },
};

export const pageTransition: Transition = { duration: duration.page, ease: ease.out };

export const stagger = {
  children: 0.06,
  delay: 0.08,
};
