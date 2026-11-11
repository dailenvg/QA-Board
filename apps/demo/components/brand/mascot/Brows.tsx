"use client";

import { motion } from "motion/react";
import { duration, spring } from "@/lib/motion";
import { BROW_LEFT_PATH, BROW_RIGHT_PATH } from "./paths";

const BROW_WIDTH = 16;
/** Pressed flat against the eyes, so the brows grow up out of them. */
const hidden = { opacity: 0, scaleY: 0.2, y: 12 };

/**
 * Worried brows over the eyes, in the eye color. They rise into place; reduced
 * motion just shows them.
 */
export function WorriedBrows({ color, reduce }: { color: string; reduce: boolean }) {
  return (
    <motion.g
      initial={reduce ? false : hidden}
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { ...hidden, transition: { duration: duration.micro } }}
      transition={reduce ? { duration: 0 } : spring.jelly}
    >
      {[BROW_LEFT_PATH, BROW_RIGHT_PATH].map((d) => (
        <path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={BROW_WIDTH}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </motion.g>
  );
}
