import type { Comment } from "@/lib/store/types";
import { showsPriority, type PriorityFilter } from "./priority-view";
import { commentSurfaceKey } from "./surface";
import type { CommentTab } from "./types";

/** The viewer's state as a comment link is followed: everything that could hide the comment. */
export interface LinkedView {
  tab: CommentTab;
  filter: PriorityFilter;
  /**
   * A restored draft's surface (`Draft.surfaceKey`), or null. The stage stays there, so the
   * unsent comment isn't left out of sight.
   */
  draftSurfaceKey: string | null;
  /** The comments the list's page or breakpoint scope shows now. */
  scoped: readonly Pick<Comment, "id">[];
}

/** What to change so a linked comment shows: only what hides it (D16). */
export interface CommentLinkWidening {
  id: string;
  /** The tab it's listed on, when it's the other one; else null. */
  tab: CommentTab | null;
  /** The priority filter hides it: show every priority. */
  showAllPriorities: boolean;
  /** The stage stays put and the list's page or breakpoint scope hides it: show them all. */
  showAllScope: boolean;
  /**
   * A restored draft holds the stage on another surface: select the card only, without
   * bringing the pin's surface (and its popover) onto the stage.
   */
  keepStage: boolean;
}

export type CommentLinkPlan = ({ found: true } & CommentLinkWidening) | { found: false };

/**
 * How to show the comment a link names, among the `comments` this viewer can
 * see (a guest's are the review link's), or not found. Brings it onto the stage
 * (its page, snapshot or breakpoint) unless a restored draft is there, and
 * widens only the tab, priority filter or scope that would hide it.
 */
export function planCommentLink(
  id: string,
  comments: readonly Comment[],
  view: LinkedView,
): CommentLinkPlan {
  const comment = comments.find((entry) => entry.id === id);
  if (!comment) return { found: false };
  const keepStage =
    view.draftSurfaceKey !== null && commentSurfaceKey(comment) !== view.draftSurfaceKey;
  return {
    found: true,
    id,
    tab: comment.status === view.tab ? null : comment.status,
    showAllPriorities: !showsPriority(comment.priority, view.filter),
    showAllScope: keepStage && !view.scoped.some((entry) => entry.id === id),
    keepStage,
  };
}
