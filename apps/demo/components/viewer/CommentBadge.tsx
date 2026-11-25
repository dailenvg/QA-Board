import type { Comment } from "@/lib/store/types";
import { commentTone } from "./comment-tone";
import { PriorityDot } from "./PriorityDot";

interface CommentBadgeProps {
  comment: Comment;
  number: number;
}

/**
 * The comment's pin number in its pin's colors, and its edge line once resolved (`pin-line`),
 * with its priority's corner dot, as on the pin. Screen readers hear "Comment 3" (the chip
 * beside the comment says its priority).
 */
export function CommentBadge({ comment, number }: CommentBadgeProps) {
  const tone = commentTone(comment.author, comment.status === "resolved");
  return (
    <span
      style={tone.style}
      className={`pin-line relative grid size-6 shrink-0 place-items-center rounded-pin text-label font-bold ${tone.className}`}
    >
      <span className="sr-only">Comment </span>
      {number}
      <PriorityDot priority={comment.priority} on="badge" />
    </span>
  );
}
