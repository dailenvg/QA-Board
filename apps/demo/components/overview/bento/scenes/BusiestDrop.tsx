import { motion } from "motion/react";
import type { ReactNode } from "react";
import { duration, sceneStep } from "@/lib/motion";

interface BusiestDropProps {
  /** The folder's newest projects' thumbnails; three at most drop. */
  thumbs: readonly ReactNode[];
}

/**
 * The folder's projects popping up over its mascot and dropping in, one after another, gone
 * by the end (so the final frame, as with reduced motion, is the mascot alone). Decorative.
 */
export function BusiestDrop({ thumbs }: BusiestDropProps) {
  return (
    <span className="absolute inset-x-0 top-0 flex justify-center">
      {thumbs.slice(0, 3).map((thumb, index) => (
        <motion.span
          key={index}
          data-testid="scene-drop"
          className="absolute block rounded-field bg-card shadow-seg"
          style={{ left: `${20 + index * 22}%` }}
          initial={{ opacity: 0, y: -28, scale: 0.4 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-28, -34, -10, 12], scale: [0.4, 0.7, 0.7, 0.3] }}
          transition={{
            duration: duration.page,
            times: [0, 0.3, 0.7, 1],
            delay: index * sceneStep,
          }}
        >
          {thumb}
        </motion.span>
      ))}
    </span>
  );
}
