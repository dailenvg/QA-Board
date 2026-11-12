import { motion } from "motion/react";
import { duration, ease, sceneStep } from "@/lib/motion";
import { MockCursor } from "../../welcome/MockCursor";
import { MockPage } from "../../welcome/MockPage";
import { StoryMascot } from "../../welcome/StoryMascot";
import { StoryStage } from "../../welcome/StoryStage";
import { SCENE_TINT } from "./scene-colors";
import { PIN_SPOTS } from "./scene-spots";
import { ScenePin } from "./ScenePin";

/** The most pins the page shows; more news still shows in the count. */
export const SCENE_PINS = PIN_SPOTS.length;

interface ClientsSceneProps {
  /** New client comments: one pin each, up to `SCENE_PINS`. */
  count: number;
  still: boolean;
}

/**
 * A client's cursor dropping numbered pins on a page, one per new comment, while Squiggy
 * peeks in to listen: the welcome's Pin story, cut down to its key beat. In greys
 * (`.scene-grey`), Squiggy apart.
 */
export function ClientsScene({ count, still }: ClientsSceneProps) {
  const shown = Math.min(count, SCENE_PINS);
  const last = PIN_SPOTS[Math.max(0, shown - 1)] ?? [50, 50];
  return (
    <StoryStage tint={SCENE_TINT} still={still}>
      <MockPage>
        {Array.from({ length: shown }, (_, index) => (
          <ScenePin
            key={index}
            number={index + 1}
            delay={index * sceneStep * 0.5}
            at={PIN_SPOTS[index] ?? [50, 50]}
          />
        ))}
        {/* The cursor glides in to where the last pin lands, and stays beside it. */}
        <motion.span
          className="absolute block size-0"
          style={{ left: `${last[0]}%`, top: `${last[1]}%` }}
          initial={{ opacity: 0, x: 24, y: 18 }}
          animate={{ opacity: 1, x: 6, y: 4 }}
          transition={{ duration: duration.component, ease: ease.out }}
        >
          <MockCursor pose="on" anchor="top-0 left-0" />
        </motion.span>
      </MockPage>
      <StoryMascot mood="listening" playing={false} still edge="left" size="2.75rem" />
    </StoryStage>
  );
}
