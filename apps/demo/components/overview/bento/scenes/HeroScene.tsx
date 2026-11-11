import { sceneStep } from "@/lib/motion";
import { MockPage } from "../../welcome/MockPage";
import { StoryStage } from "../../welcome/StoryStage";
import { SCENE_TINT } from "./scene-colors";
import { PIN_SPOTS } from "./scene-spots";
import { ScenePin } from "./ScenePin";

interface HeroSceneProps {
  open: number;
  resolved: number;
  /** Reduced motion: the final frame. */
  still: boolean;
}

/**
 * A project page with the workspace's pins on it: open ones first, then resolved ones, lighter
 * with a check, up to six in all, dropping one after another. In greys (`.scene-grey`).
 */
export function HeroScene({ open, resolved, still }: HeroSceneProps) {
  const openPins = Math.min(open, PIN_SPOTS.length);
  const resolvedPins = Math.min(resolved, PIN_SPOTS.length - openPins);
  const pins = [
    ...Array.from({ length: openPins }, () => false),
    ...Array.from({ length: resolvedPins }, () => true),
  ];
  return (
    <StoryStage tint={SCENE_TINT} still={still}>
      <MockPage>
        {pins.map((done, index) => (
          <ScenePin
            key={index}
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
