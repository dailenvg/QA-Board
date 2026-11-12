import type { CSSProperties } from "react";
import { commenterColor } from "@/lib/brand-palette";

export interface CommentTone {
  className: string;
  style?: CSSProperties;
}

/** Resolved Mint is about as light as white, so its pins and badges get a Forest edge line. */
const RESOLVED_TONE: CommentTone = {
  className: "bg-resolved-pin text-on-resolved-pin",
  style: { "--pin-line": "var(--resolved-pin-line)" } as CSSProperties,
};

/**
 * Fill and number color shared by a comment's pin and its badges, so a card
 * visibly matches its pin: the commenter's color while open, filled green once
 * resolved, edged in Forest (`--pin-line`, drawn by `.pin-marker` and `pin-line`).
 * Pins sit on any content, so these are the same in both themes.
 */
export function commentTone(author: string, resolved: boolean): CommentTone {
  if (resolved) return RESOLVED_TONE;
  const color = commenterColor(author);
  return {
    className: "bg-(--comment-fill) text-(--comment-ink)",
    style: { "--comment-fill": color.hex, "--comment-ink": color.ink } as CSSProperties,
  };
}
