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

/** Hover and press feedback for cards: a subtle grow in place, a small give on press. */
export const hoverGrow = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: spring.soft,
} as const;

/**
 * Links inside cards (list rows): they stay put on hover or keyboard focus
 * (their fill says so) and give on press. Variant labels, so a trailing arrow
 * can follow (`arrowNudge`). Use with `initial="rest" animate="rest"
 * whileHover="hover" whileFocus="hover" whileTap="press"`.
 */
export const rowPress: Variants = {
  rest: { scale: 1, transition: spring.snappy },
  hover: { scale: 1, transition: spring.snappy },
  press: { scale: 0.98, transition: spring.snappy },
};

/** A link's trailing arrow, nudged forward while its row is hovered, focused or pressed. */
export const arrowNudge: Variants = {
  rest: { x: 0, transition: spring.snappy },
  hover: { x: 3, transition: spring.snappy },
  press: { x: 3, transition: spring.snappy },
};

/** Seconds a number takes to count up to its value, or a bar to grow to its length. */
export const tally = 0.8;

/**
 * Illustrated scenes in cards (the Overview's bento): each plays once as it comes on screen,
 * and again on hover or focus, all within `tally`. Their pieces enter `sceneStep` apart, each
 * taking `duration.component`, so a scene of up to six pieces ends in time.
 */
export const sceneStep = 0.08;

/** How far, in px, content rises as it reveals (`fadeUp`). */
export const rise = 16;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: rise },
  visible: { opacity: 1, y: 0, transition: { duration: duration.component, ease: ease.out } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: duration.micro, ease: ease.out } },
};

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.micro } },
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

/**
 * One whole screen giving way to another in place, such as a guest's password
 * screen and the review it opens: a quick fade out, then a page-length fade in.
 * Opacity only, no rise: a transformed ancestor becomes the containing block of
 * `position: fixed` layers inside the screen (bottom sheets, toasts), which
 * would sit in the wrong place until the transform ended.
 */
export const screenSwap: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.page, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.micro, ease: ease.out } },
};

/** Menus, popovers and dialogs: scale up from slightly smaller. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.96, y: 4, transition: { duration: duration.micro } },
};

/** A phone's bottom sheet: up from below its edge, and back down. */
export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: { opacity: 1, y: 0, transition: spring.soft },
  exit: { opacity: 0, y: 48, transition: { duration: duration.micro, ease: ease.out } },
};

/**
 * Content swapped in place (a dialog's tabs, a section's states): a short
 * sideways fade, `direction` 1 forward, -1 back.
 */
export const swapIn: Variants = {
  hidden: (direction: number = 1) => ({ opacity: 0, x: 12 * direction }),
  visible: { opacity: 1, x: 0, transition: { duration: duration.component, ease: ease.out } },
  exit: (direction: number = 1) => ({
    opacity: 0,
    x: -12 * direction,
    transition: { duration: duration.micro, ease: ease.out },
  }),
};

/** `whileInView` for content below the fold: reveal once, a little after it enters. */
export const revealViewport = { once: true, margin: "-10%" } as const;

/** Seconds between one item's entrance and the next's in a stagger. */
export const staggerStep = 0.06;

export function staggerGroup(staggerChildren = staggerStep, delayChildren = 0.08): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren, delayChildren } } };
}

/** `fadeUp`, collapsed to a plain fade when the user prefers reduced motion. */
export function useRevealVariants(): Variants {
  return useReducedMotion() ? fadeOnly : fadeUp;
}

/** `screenSwap`, collapsed to a plain fade when the user prefers reduced motion. */
export function useScreenVariants(): Variants {
  return useReducedMotion() ? fadeOnly : screenSwap;
}

/** `popIn`, collapsed to a plain fade when the user prefers reduced motion. */
export function usePopVariants(): Variants {
  return useReducedMotion() ? fadeOnly : popIn;
}

/** `sheetUp`, collapsed to a plain fade when the user prefers reduced motion. */
export function useSheetVariants(): Variants {
  return useReducedMotion() ? fadeOnly : sheetUp;
}

/** `swapIn`, collapsed to a plain fade when the user prefers reduced motion. */
export function useSwapVariants(): Variants {
  return useReducedMotion() ? fadeOnly : swapIn;
}
