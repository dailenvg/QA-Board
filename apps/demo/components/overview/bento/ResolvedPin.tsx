import { MockPin } from "../welcome/MockPin";
import { STORY_COMMENTER } from "../welcome/story-script";

/**
 * The welcome stories' pin, resolved (green, with a check), dropping into a 24px box of its
 * own: MockPin hangs from its parent's top-right corner, so it's hung from this box's
 * bottom-left. Decorative.
 */
export function ResolvedPin() {
  return (
    <span aria-hidden="true" className="relative block size-6 shrink-0">
      <span className="absolute bottom-0 left-0 block size-0">
        <MockPin color={STORY_COMMENTER} resolved />
      </span>
    </span>
  );
}
