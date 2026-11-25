import type { CommentPriority } from "@/lib/store/types";
import { PRIORITY_DOT } from "./priority-tone";

interface PriorityDotProps {
  priority: CommentPriority | undefined;
  /**
   * `pin`: haloed like the pin itself (`.pin-marker`), as it sits on any page or image.
   * `badge`: cut out of the card or popover it sits on, like an avatar's badge.
   */
  on: "pin" | "badge";
}

const FRAME = {
  pin: "pin-marker",
  badge: "shadow-[0_0_0_2px_var(--avatar-surface,var(--color-panel))]",
} as const;

/**
 * A comment's priority as a 10px dot on the top-right corner of its pin or
 * badge (U3): the pin keeps its commenter's color. Decorative: the pin's label
 * and the card's chip say the priority. Nothing for none.
 */
export function PriorityDot({ priority, on }: PriorityDotProps) {
  if (!priority) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="priority-dot"
      data-priority={priority}
      className={`absolute -top-1 -right-1 size-2.5 rounded-pill ${PRIORITY_DOT[priority]} ${FRAME[on]}`}
    />
  );
}
