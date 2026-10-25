import type { Comment } from "@/lib/store/types";
import { commentTone } from "./comment-tone";

interface CommentBadgeProps {
  comment: Comment;
  number: number;
}

/** The comment's pin number in its pin's colors. Screen readers hear "Comment 3". */
export function CommentBadge({ comment, number }: CommentBadgeProps) {
  const tone = commentTone(comment.author, comment.status === "resolved");
  return (
    <span
      style={tone.style}
      className={`grid size-6 shrink-0 place-items-center rounded-pin text-label font-bold ${tone.className}`}
    >
      <span className="sr-only">Comment </span>
      {number}
    </span>
  );
}
