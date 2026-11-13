import { sceneStep } from "@/lib/motion";
import { MockPage } from "../../welcome/MockPage";
import { STORY_COMMENTER } from "../../welcome/story-script";
import { StoryStage } from "../../welcome/StoryStage";
import { PIN_SPOTS } from "./scene-spots";
import { ScenePin } from "./ScenePin";

interface HeroSceneProps {
  open: number;
  resolved: number;
  /** Reduced motion: the final frame. */
  still: boolean;
}

/**
 * A project page with the workspace's pins on it: open ones in the commenter's color first,
 * then resolved ones, green with a check, up to six in all, dropping one after another. In
 * Squint's colors, the one scene that isn't grey (`SceneBox colored`).
 */
export function HeroScene({ open, resolved, still }: HeroSceneProps) {
  const openPins = Math.min(open, PIN_SPOTS.length);
  const resolvedPins = Math.min(resolved, PIN_SPOTS.length - openPins);
  const pins = [
    ...Array.from({ length: openPins }, () => false),
    ...Array.from({ length: resolvedPins }, () => true),
  ];
  return (
    <StoryStage tint="var(--color-brand)" still={still}>
      <MockPage>
        {pins.map((done, index) => (
          <ScenePin
            key={index}
            color={STORY_COMMENTER}
            number={index + 1}
            resolved={done}
            delay={index * sceneStep * 0.5}
            at={PIN_SPOTS[index] ?? [50, 50]}
          />
        ))}
      </MockPage>
    </StoryStage>
  );
}
