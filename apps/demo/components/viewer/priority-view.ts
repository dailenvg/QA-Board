import { PRIORITY_LABEL } from "@/lib/store/priority";
import type { Comment, CommentPriority } from "@/lib/store/types";

/** How the panel orders its comments: by pin number (the default), or by priority (D11). */
export type CommentSort = "pin" | "priority";

/** Which comments the panel and the stage show: all, one priority's, or those without one. */
export type PriorityFilter = "all" | CommentPriority | "none";

/** The panel's "Sort and filter" choice: view state only, never saved, never renumbering pins. */
export interface CommentView {
  sort: CommentSort;
  filter: PriorityFilter;
}

export const DEFAULT_VIEW: CommentView = { sort: "pin", filter: "all" };

export const SORT_LABEL: Record<CommentSort, string> = {
  pin: "Pin number",
  priority: "Priority",
};

export const FILTER_LABEL: Record<PriorityFilter, string> = {
  all: "All priorities",
  must: PRIORITY_LABEL.must,
  should: PRIORITY_LABEL.should,
  nit: PRIORITY_LABEL.nit,
  none: "No priority",
};

/** Whether the view is changed from the default, so its button says so. */
export function isDefaultView({ sort, filter }: CommentView): boolean {
  return sort === DEFAULT_VIEW.sort && filter === DEFAULT_VIEW.filter;
}

/** Whether a comment with `priority` (missing for none) shows under `filter`. */
export function showsPriority(
  priority: CommentPriority | undefined,
  filter: PriorityFilter,
): boolean {
  if (filter === "all") return true;
  return filter === "none" ? priority === undefined : priority === filter;
}

/** The comments `filter` shows, in the order given; the same list when it shows all. */
export function filterByPriority<T extends Pick<Comment, "priority">>(
  comments: readonly T[],
  filter: PriorityFilter,
): readonly T[] {
  return filter === "all"
    ? comments
    : comments.filter((comment) => showsPriority(comment.priority, filter));
}

const RANK: Record<CommentPriority, number> = { must: 0, should: 1, nit: 2 };

/** Must fix first, then Should fix, then Nit, then none (D11). */
const rank = (priority: CommentPriority | undefined) =>
  priority === undefined ? 3 : RANK[priority];

/**
 * The comments in `sort` order: as given for pin number (they come in pin
 * order), or Must fix, Should fix, Nit, none, each by pin number (D11). Pin
 * numbers (`numbers`) never change.
 */
export function sortComments<T extends Pick<Comment, "id" | "priority">>(
  comments: readonly T[],
  sort: CommentSort,
  numbers: ReadonlyMap<string, number>,
): readonly T[] {
  if (sort === "pin") return comments;
  const number = (comment: T) => numbers.get(comment.id) ?? 0;
  return [...comments].sort((a, b) => rank(a.priority) - rank(b.priority) || number(a) - number(b));
}

/** The empty list's title when the filter hides every comment on the tab. */
export function filteredOutTitle(filter: Exclude<PriorityFilter, "all">): string {
  return filter === "none"
    ? "No comments without a priority here"
    : `No ${PRIORITY_LABEL[filter]} comments here`;
}
