import type { Comment } from "@/lib/store/types";
import type { CommentTab } from "./types";

/**
 * The comments a tab lists: those with its status, plus any whose editor is
 * open (`editing`, as each was when its editor opened). A comment resolved or
 * deleted by someone else meanwhile stays where it was until its editor
 * closes, so the words being typed into it are never lost.
 */
export function listedOnTab(
  comments: readonly Comment[],
  tab: CommentTab,
  editing: ReadonlyMap<string, Comment>,
): Comment[] {
  const present = new Set(comments.map((comment) => comment.id));
  return [
    ...comments.filter((comment) => comment.status === tab || editing.has(comment.id)),
    ...[...editing.values()].filter((comment) => !present.has(comment.id)),
  ];
}
