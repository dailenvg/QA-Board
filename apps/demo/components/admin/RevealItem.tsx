"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRevealVariants } from "@/lib/motion";
import { rowViewport, rowVariants } from "./admin-motion";

interface RevealItemProps {
  /** Its place in the list, for the entrance's stagger. */
  order: number;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * A list item that rises in as it comes on screen, a stagger step after the
 * one before it, as the audit log's entries do (`rowViewport`, so a page's
 * last row shows too); a plain fade with reduced motion.
 */
export function RevealItem({ order, children, className = "", testId }: RevealItemProps) {
  const reduce = useReducedMotion() ?? false;
  const fade = useRevealVariants();
  return (
    <motion.li
      custom={order}
      variants={reduce ? fade : rowVariants}
      initial="hidden"
      whileInView="visible"
      viewport={rowViewport}
      data-testid={testId}
      className={className}
    >
      {children}
    </motion.li>
  );
}
