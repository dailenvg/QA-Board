"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

/** Page transition: every route enters with a fade and a short rise. */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? duration.micro : duration.page, ease: ease.out }}
    >
      {children}
    </motion.div>
  );
}
