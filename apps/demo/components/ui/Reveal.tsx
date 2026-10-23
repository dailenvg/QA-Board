"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { staggerGroup, viewportOnce } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
}

/** Reveals its `RevealItem` children in sequence when scrolled into view. */
export function Reveal({ children, className, stagger = 0.08 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={staggerGroup(stagger)}
    >
      {children}
    </motion.div>
  );
}
