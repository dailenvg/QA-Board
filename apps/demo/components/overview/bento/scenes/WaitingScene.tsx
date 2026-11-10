import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { commenterColor } from "@/lib/brand-palette";
import { duration, ease, sceneStep } from "@/lib/motion";
import { StoryMascot } from "../../welcome/StoryMascot";

/** The most bubbles the stack shows; a bigger count still shows in the tag. */
const STACK = 4;

/** Whose bubbles: a few commenter colors, so the stack reads as several people. */
const VOICES = ["Sam", "Ana", "Cleo", "Mia"].map(commenterColor);

interface WaitingSceneProps {
  open: number;
}

/**
 * Comment bubbles piling up beside a thinking Squiggy: one per open comment, up to four,
 * each rising in after the one before. Decorative.
 */
export function WaitingScene({ open }: WaitingSceneProps) {
  const bubbles = Math.min(open, STACK);
  return (
    <span className="relative block h-full overflow-hidden rounded-tile bg-comments-soft">
      {Array.from({ length: bubbles }, (_, index) => (
        <motion.span
          key={index}
          data-testid="scene-bubble"
          className="absolute flex h-7 w-28 items-center gap-1.5 rounded-tile bg-card px-2 shadow-seg ring-1 ring-line"
          style={{ left: `${8 + index * 12}%`, top: `${12 + index * 10}%`, zIndex: index }}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: duration.component, ease: ease.out, delay: index * sceneStep }}
        >
          <span
            style={{ "--dot": VOICES[index % VOICES.length]?.hex } as CSSProperties}
            className="size-2 shrink-0 rounded-pill bg-(--dot)"
          />
          <span className="h-1.5 flex-1 rounded-pill bg-line-strong" />
          <span className="h-1.5 w-4 rounded-pill bg-line" />
        </motion.span>
      ))}
      <StoryMascot mood="thinking" playing={false} still edge="bottom-right" size="3rem" />
    </span>
  );
}
