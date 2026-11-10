import { motion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease, sceneStep } from "@/lib/motion";

/** Each card's place in the fan: left, middle (on top), right. */
const FAN = [
  { rotate: -12, x: -18 },
  { rotate: 0, x: 0 },
  { rotate: 12, x: 18 },
] as const;

interface RecentFanProps {
  /** The newest projects' thumbnails, newest first; three at most show. */
  thumbs: readonly ReactNode[];
}

/** The newest projects as little cards fanning out from one stack. Decorative. */
export function RecentFan({ thumbs }: RecentFanProps) {
  const cards = thumbs.slice(0, FAN.length);
  return (
    // Two thirds the size where the bento fits one screen, so the list keeps a whole row.
    <span className="relative grid size-full origin-left place-items-center bento-fit:scale-[0.7]">
      {cards.map((thumb, index) => {
        const place = FAN[cards.length === 1 ? 1 : index] ?? FAN[1];
        return (
          <motion.span
            key={index}
            data-testid="scene-card"
            className="absolute block rounded-field bg-card shadow-seg"
            style={{ zIndex: index === 1 ? 2 : 1, originY: 1 }}
            initial={{ rotate: 0, x: 0, opacity: 0, scale: 0.8 }}
            animate={{ rotate: place.rotate, x: place.x, opacity: 1, scale: 1 }}
            transition={{ duration: duration.component, ease: ease.out, delay: index * sceneStep }}
          >
            {thumb}
          </motion.span>
        );
      })}
    </span>
  );
}
