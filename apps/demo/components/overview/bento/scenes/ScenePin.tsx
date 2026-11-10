import type { CommenterColor } from "@/lib/brand-palette";
import { MockPin } from "../../welcome/MockPin";

interface ScenePinProps {
  color: CommenterColor;
  number: number;
  resolved?: boolean;
  /** Seconds before it drops. */
  delay: number;
  /** Where its tip lands, in % of the positioned box it sits in. */
  at: readonly [number, number];
}

/** A welcome-story pin whose tip lands at `at` (MockPin hangs from its parent's corner). */
export function ScenePin({ color, number, resolved = false, delay, at }: ScenePinProps) {
  const [x, y] = at;
  return (
    <span className="absolute block size-0" style={{ left: `${x}%`, top: `${y}%` }}>
      <MockPin color={color} number={number} resolved={resolved} delay={delay} />
    </span>
  );
}
