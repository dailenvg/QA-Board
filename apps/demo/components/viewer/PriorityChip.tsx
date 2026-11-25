import { PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { PRIORITY_CHIP } from "./priority-tone";

interface PriorityChipProps {
  /** Referenced by the card's or popover's description, so it's read with the comment. */
  id?: string;
  priority: CommentPriority;
  className?: string;
}

/**
 * A comment's priority as a chip with the flag icon: "Must fix", "Should fix"
 * or "Nit". The page and breakpoint chips' size, so they line up beside it.
 * Screen readers hear "Priority: Must fix".
 */
export function PriorityChip({ id, priority, className = "" }: PriorityChipProps) {
  return (
    <p
      id={id}
      data-testid="comment-priority"
      data-priority={priority}
      className={`inline-flex items-center gap-2 rounded-pill px-3 py-1 text-label font-semibold ${PRIORITY_CHIP[priority]} ${className}`}
    >
      <Icon name="flag" className="size-3.5" />
      <span className="sr-only">Priority: </span>
      {PRIORITY_LABEL[priority]}
    </p>
  );
}
