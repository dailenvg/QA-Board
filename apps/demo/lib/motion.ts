import { useReducedMotion, type Transition, type Variants } from "motion/react";

type Bezier = [number, number, number, number];

/** Shared motion tokens for the app and the mascot. Import these instead of inlining numbers. */
export const duration = {
  micro: 0.18,
  component: 0.32,
  page: 0.5,
  /** One breath of an idle loop, such as a skeleton's pulse. */
  loop: 1.6,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as Bezier,
  /** Slow in and out for idle loops (breathing, bobbing). */
  breathe: [0.45, 0, 0.55, 1] as Bezier,
};

export const spring = {
  snappy: { type: "spring", stiffness: 300, damping: 28 },
  soft: { type: "spring", stiffness: 220, damping: 26 },
  ui: { type: "spring", stiffness: 260, damping: 26 },
  pose: { type: "spring", stiffness: 220, damping: 24 },
  eye: { type: "spring", stiffness: 300, damping: 26 },
  jelly: { type: "spring", stiffness: 420, damping: 14 },
  flip: { type: "spring", stiffness: 380, damping: 28 },
} as const satisfies Record<string, Transition>;

/** Spring options for `useSpring` (no `type` key). */
export const springValue = {
  gaze: { stiffness: 200, damping: 22, mass: 0.6 },
  swing: { stiffness: 160, damping: 12, mass: 0.8 },
};

/** Reduced-motion replacement for springs on `layout` / `layoutId` elements: jump, don't glide. */
export const instant = { duration: 0 } as const satisfies Transition;

/** Micro-interactions for buttons and toggles. */
export const press = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;

/** Hover and press feedback for cards: a subtle lift and grow, a small give on press. */
export const hoverLift = {
  whileHover: { y: -4, scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: spring.soft,
} as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.component, ease: ease.out } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: duration.micro, ease: ease.out } },
};

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.micro } },
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

/** Menus, popovers and dialogs: scale up from slightly smaller. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.96, y: 4, transition: { duration: duration.micro } },
};

export function staggerGroup(staggerChildren = 0.06, delayChildren = 0.08): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren, delayChildren } } };
}

/** `fadeUp`, collapsed to a plain fade when the user prefers reduced motion. */
export function useRevealVariants(): Variants {
  return useReducedMotion() ? fadeOnly : fadeUp;
}

/** `popIn`, collapsed to a plain fade when the user prefers reduced motion. */
export function usePopVariants(): Variants {
  return useReducedMotion() ? fadeOnly : popIn;
}
