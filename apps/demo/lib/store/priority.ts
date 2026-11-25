import type { CommentPriority } from "./types";

/** Every priority, most pressing first. A comment without one has none (null). */
export const COMMENT_PRIORITIES = [
  "must",
  "should",
  "nit",
] as const satisfies readonly CommentPriority[];

/** What each priority is called wherever it shows (U4). */
export const PRIORITY_LABEL: Record<CommentPriority, string> = {
  must: "Must fix",
  should: "Should fix",
  nit: "Nit",
};

/** A priority as stored and sent: one of `COMMENT_PRIORITIES`, or null for none. */
export function isPriority(value: unknown): value is CommentPriority {
  return COMMENT_PRIORITIES.some((priority) => priority === value);
}
