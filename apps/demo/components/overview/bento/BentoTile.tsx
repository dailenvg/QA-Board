"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease, revealViewport, rise, staggerStep } from "@/lib/motion";

/** `fadeUp`'s rise, each tile a stagger step after the one before it. */
const tileVariants: Variants = {
  hidden: { opacity: 0, y: rise },
  visible: (order: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: duration.component, ease: ease.out, delay: order * staggerStep },
  }),
};

interface BentoTileProps {
  /** Reading order: tiles on screen together rise in one after another. */
  order: number;
  /** Grid spans. */
  className?: string;
  children: ReactNode;
}

/**
 * One cell of the Overview's bento. It rises in once it's on screen (on
 * phones, as it's scrolled to), a step after the tile before it. Nothing is
 * ever left hidden: with reduced motion tiles are simply there (no hidden
 * start); where IntersectionObserver is missing, Motion's viewport fallback
 * shows them at once; and print, which never scrolls them into view, forces
 * them visible.
 */
export function BentoTile({ order, className = "", children }: BentoTileProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      custom={order}
      variants={tileVariants}
      initial={reduce ? false : "hidden"}
      whileInView="visible"
      viewport={revealViewport}
      className={`min-w-0 print:transform-none! print:opacity-100! ${className}`}
    >
      {children}
    </motion.div>
  );
}
