import type { Comment } from "./types";

export type ProjectStatus = "ready" | "comments" | "resolved";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  ready: "Ready to review",
  comments: "Comments in",
  resolved: "Comments resolved",
};

export interface CommentCounts {
  active: number;
  resolved: number;
}

export function countComments(comments: readonly Comment[]): CommentCounts {
  let active = 0;
  for (const comment of comments) if (comment.status === "active") active += 1;
  return { active, resolved: comments.length - active };
}

/** No comments: ready. Any open comment: comments in. Every comment resolved: resolved. */
export function deriveStatus({ active, resolved }: CommentCounts): ProjectStatus {
  if (active > 0) return "comments";
  return resolved > 0 ? "resolved" : "ready";
}
