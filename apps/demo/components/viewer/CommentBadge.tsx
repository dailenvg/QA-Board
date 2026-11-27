import type { Comment } from "@/lib/store/types";
import { commentTone } from "./comment-tone";
import { PinNumberText } from "./PinNumberText";
import { PriorityDot } from "./PriorityDot";

interface CommentBadgeProps {
  comment: Comment;
  /** Its pin number as shown: "4", or "T1" for a team-only comment (D13). */
  number: string;
}

/**
 * The comment's pin number in its pin's colors, and its edge line once resolved (`pin-line`),
 * with its priority's corner dot, as on the pin. Screen readers hear "Comment 3", or
 * "Team-only comment T1" (the chip beside the comment says its priority). A T number is wider,
 * so the badge grows sideways instead of squeezing it.
 */
export function CommentBadge({ comment, number }: CommentBadgeProps) {
  const tone = commentTone(comment.author, comment.status === "resolved");
  return (
    <span
      style={tone.style}
      data-testid="comment-badge"
      className={`pin-line relative grid h-6 min-w-6 shrink-0 place-items-center rounded-pin px-1 text-label font-bold ${tone.className}`}
    >
      <span className="sr-only">{comment.teamOnly ? "Team-only comment " : "Comment "}</span>
      <PinNumberText number={number} />
      <PriorityDot priority={comment.priority} on="badge" />
    </span>
  );
}
