import { MockPin, type PinColor } from "../../welcome/MockPin";
import { SCENE_PIN } from "./scene-colors";

interface ScenePinProps {
  /** The scene's grey unless given. */
  color?: PinColor;
  number: number;
  resolved?: boolean;
  /** Seconds before it drops. */
  delay: number;
  /** Where its tip lands, in % of the positioned box it sits in. */
  at: readonly [number, number];
}

/**
 * A welcome-story pin, in the scene's greys unless `color` says otherwise, whose tip lands at
 * `at` (MockPin hangs from its parent's corner).
 */
export function ScenePin({
  color = SCENE_PIN,
  number,
  resolved = false,
  delay,
  at,
}: ScenePinProps) {
  const [x, y] = at;
  return (
    <span className="absolute block size-0" style={{ left: `${x}%`, top: `${y}%` }}>
      <MockPin color={color} number={number} resolved={resolved} delay={delay} />
    </span>
  );
}
