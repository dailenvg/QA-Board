import type { Variants } from "motion/react";
import { duration, ease, rise, staggerStep } from "@/lib/motion";

/** A list while it waits on the server: dimmed, but muted text keeps near 3:1. */
export const PENDING_OPACITY = 0.7;

/**
 * `whileInView` for a list's rows inside a card that already revealed: once,
 * as soon as any of the row shows. Not `revealViewport`'s -10% margin, which
 * a page's last row, in the bottom tenth of the screen even scrolled all the
 * way, would never reach.
 */
export const rowViewport = { once: true } as const;

/** Rows past this many on screen at once rise in together, not one by one. */
const STAGGERED = 8;

/**
 * A list row's entrance: `fadeUp`'s rise, each row (`custom`, its order) a
 * stagger step after the one before it, up to `STAGGERED`. It leaves as
 * `fadeUp` does.
 */
export const rowVariants: Variants = {
  hidden: { opacity: 0, y: rise },
  visible: (order: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.component,
      ease: ease.out,
      delay: Math.min(order, STAGGERED) * staggerStep,
    },
  }),
  exit: { opacity: 0, scale: 0.96, transition: { duration: duration.micro, ease: ease.out } },
};
