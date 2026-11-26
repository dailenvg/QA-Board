import { useEffect, useRef } from "react";
import { COMMENT_PARAM, parseCommentParam, withoutCommentParam } from "@/lib/comment-link";
import type { Comment } from "@/lib/store/types";
import type { ToastInput } from "../ui/ToastProvider";
import { planCommentLink, type CommentLinkWidening, type LinkedView } from "./comment-link-plan";

/** Said when a link's comment isn't there: deleted, or (a guest's) not on this review. */
export const LINK_MISSING = {
  team: "That comment is no longer here. It may have been deleted.",
  guest: "That comment isn't on this review any more.",
} as const;

interface CommentLinkOptions {
  /** The comments this viewer can see: a guest's are only the review link's. */
  comments: readonly Comment[];
  view: LinkedView;
  selectedId: string | null;
  /** `LINK_MISSING`'s line for this viewer. */
  missing: string;
  toast: (toast: ToastInput) => void;
  /** Shows the tab, every priority or every page's (breakpoint's) comments, as the plan says. */
  widen: (widening: CommentLinkWidening) => void;
  /** Selects the comment's card; unless `keepStage`, its pin's surface comes onto the stage. */
  select: (id: string, keepStage: boolean) => void;
  /** Opens the pin's popover, once the pin is drawn. */
  open: (id: string) => void;
}

/** The pin waiting to be drawn, and whether its card has been seen selected since. */
interface Awaiting {
  id: string;
  selected: boolean;
}

/**
 * The address's `?comment=`, or undefined when there's none; null when it
 * names nothing an id could be. Dropped from the address either way (D15),
 * the rest of the query (such as `?page=`) kept.
 */
function takeCommentParam(): string | null | undefined {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(COMMENT_PARAM)) return undefined;
  window.history.replaceState(window.history.state, "", withoutCommentParam(url));
  return parseCommentParam(url.searchParams.get(COMMENT_PARAM));
}

function pinDrawn(id: string): boolean {
  return document.querySelector(`[data-pin-id="${CSS.escape(id)}"]`) !== null;
}

/**
 * Follows a comment link once, as the viewer opens with its data: widens
 * what hides the comment (D16), selects its card (which brings its page,
 * snapshot or breakpoint onto the stage), and opens its pin's popover once
 * the pin is drawn. An id this viewer can't see says so in a toast. The
 * parameter leaves the address either way, so a reload or a copied address
 * doesn't follow it again. Selecting anything else meanwhile cancels the popover.
 */
export function useCommentLink(options: CommentLinkOptions): void {
  const followed = useRef(false);
  const awaiting = useRef<Awaiting | null>(null);

  // After every render: the pin may arrive with any of them (a page switched, a snapshot loaded).
  useEffect(() => {
    if (!followed.current) {
      followed.current = true;
      awaiting.current = follow(options);
      return;
    }
    const pending = awaiting.current;
    if (!pending) return;
    if (options.selectedId === pending.id) pending.selected = true;
    else if (pending.selected) {
      awaiting.current = null;
      return;
    }
    if (!pending.selected || !pinDrawn(pending.id)) return;
    awaiting.current = null;
    options.open(pending.id);
  });
}

/** Acts on the address's link, if any; the comment whose pin's popover should open, if one. */
function follow({
  comments,
  view,
  missing,
  toast,
  widen,
  select,
}: CommentLinkOptions): Awaiting | null {
  const id = takeCommentParam();
  if (id === undefined) return null;
  const plan = id ? planCommentLink(id, comments, view) : ({ found: false } as const);
  if (!plan.found) {
    toast({ message: missing });
    return null;
  }
  widen(plan);
  select(plan.id, plan.keepStage);
  return plan.keepStage ? null : { id: plan.id, selected: false };
}
