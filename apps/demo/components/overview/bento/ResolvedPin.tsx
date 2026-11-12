import { MockPin } from "../welcome/MockPin";
import { SCENE_PIN } from "./scenes/scene-colors";

/**
 * The welcome stories' pin, resolved (with a check) in the scenes' greys (`.scene-grey`),
 * dropping into a 24px box of its own: MockPin hangs from its parent's top-right corner, so
 * it's hung from this box's bottom-left. Decorative.
 */
export function ResolvedPin() {
  return (
    <span aria-hidden="true" className="scene-grey relative block size-6 shrink-0">
      <span className="absolute bottom-0 left-0 block size-0">
        <MockPin color={SCENE_PIN} resolved />
      </span>
    </span>
  );
}
