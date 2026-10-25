import type { CSSProperties } from "react";
import { commenterColor } from "@/lib/brand-palette";

export interface CommentTone {
  className: string;
  style?: CSSProperties;
}

/**
 * Fill and number color shared by a comment's pin and its badges, so a card
 * visibly matches its pin: the commenter's color while open, filled green once
 * resolved. Pins sit on any content, so these are the same in both themes.
 */
export function commentTone(author: string, resolved: boolean): CommentTone {
  if (resolved) return { className: "bg-resolved-pin text-on-resolved-pin" };
  const color = commenterColor(author);
  return {
    className: "bg-(--comment-fill) text-(--comment-ink)",
    style: { "--comment-fill": color.hex, "--comment-ink": color.ink } as CSSProperties,
  };
}
