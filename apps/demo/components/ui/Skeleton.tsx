"use client";

import { motion, useReducedMotion } from "motion/react";
import { duration, ease } from "@/lib/motion";

interface SkeletonProps {
  className?: string;
}

/** Placeholder block that breathes while content loads; static with reduced motion. */
export function Skeleton({ className = "" }: SkeletonProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className={`rounded-tile bg-seg ${className}`}
      animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
      transition={
        reduce ? undefined : { duration: duration.loop, ease: ease.breathe, repeat: Infinity }
      }
    />
  );
}
