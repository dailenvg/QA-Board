import { useReducedMotion, type Transition, type Variants } from "motion/react";

/** Shared motion tokens. Import these instead of inlining numbers. */
export const duration = {
  micro: 0.18,
  component: 0.34,
  page: 0.5,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  snappy: { type: "spring", stiffness: 300, damping: 28 },
  soft: { type: "spring", stiffness: 220, damping: 26 },
} as const satisfies Record<string, Transition>;

/** Reduced-motion replacement for springs on `layout` / `layoutId` elements: jump, don't glide. */
export const instant = { duration: 0 } as const satisfies Transition;

/** Micro-interactions for buttons and toggles. */
export const press = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
} as const;

/** Micro-interactions for cards. */
export const lift = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: spring.soft,
} as const;

/** Scroll reveal: fire once, slightly before the element is fully in view. */
export const viewportOnce = { once: true, margin: "-10%" } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.component, ease: ease.out } },
};

export const fadeOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.micro } },
};

export function staggerGroup(staggerChildren = 0.08, delayChildren = 0.05): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren, delayChildren } } };
}

/** `fadeUp`, collapsed to a plain fade when the user prefers reduced motion. */
export function useRevealVariants(): Variants {
  return useReducedMotion() ? fadeOnly : fadeUp;
}
