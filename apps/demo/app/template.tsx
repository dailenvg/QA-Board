"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { duration, ease } from "@/lib/motion";

/**
 * Flips after the first client mount. The server never runs effects, so the
 * server render (and the hydrating client render) always see `false`.
 */
let hasMounted = false;

/**
 * Page transition for client-side navigations: the new route fades and rises
 * in. The first load renders without an initial state, so server-rendered
 * content is visible immediately and without JavaScript.
 */
export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [animateEntry] = useState(() => hasMounted);

  useEffect(() => {
    hasMounted = true;
  }, []);

  return (
    <motion.div
      initial={animateEntry ? { opacity: 0, y: reduce ? 0 : 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? duration.micro : duration.page, ease: ease.out }}
    >
      {children}
    </motion.div>
  );
}
