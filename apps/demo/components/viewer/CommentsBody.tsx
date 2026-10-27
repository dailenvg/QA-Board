"use client";

import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { Comment } from "@/lib/store/types";
import { CommentCard, type CardPage, type CommentCardActions } from "./CommentCard";
import type { Placement } from "./surface";
import type { CommentTab } from "./types";

interface CommentsBodyProps extends CommentCardActions {
  comments: readonly Comment[];
  numbers: ReadonlyMap<string, number>;
  placements: ReadonlyMap<string, Placement | null>;
  /** False on a shared link: comments can be read and selected, not changed. */
  canModerate: boolean;
  /** Picked in the panel's header (`PanelHeading`). */
  tab: CommentTab;
  selectedId: string | null;
  now: number;
  listRef: RefObject<HTMLUListElement | null>;
  /**
   * The breakpoint being listed, when the project has comments at another
   * one: an empty list then says where it's empty ("No comments on Mobile yet",
   * "Nothing resolved on Mobile yet").
   */
  scope?: string;
  /** On projects (and websites) with several pages: the page each card says it's on. */
  pageOf?: (comment: Comment) => CardPage | null;
}

function emptyCopy(tab: CommentTab, total: number, scope: string | undefined) {
  if (tab === "resolved") {
    return {
      title: scope ? `Nothing resolved on ${scope} yet` : "Nothing resolved yet",
      body: "Resolved comments show up here.",
    };
  }
  return total === 0
    ? {
        title: scope ? `No comments on ${scope} yet` : "No comments yet",
        body: "Choose Comment (or press C), then click or tap anywhere to drop a pin.",
      }
    : { title: "All caught up", body: "Every comment here is resolved." };
}

const stagger = staggerGroup();

/** The comment list for the selected tab, with its empty states. */
export function CommentsBody({
  comments,
  numbers,
  placements,
  canModerate,
  tab,
  selectedId,
  now,
  listRef,
  scope,
  pageOf,
  ...actions
}: CommentsBodyProps) {
  const variants = useRevealVariants();
  const shown = comments.filter((comment) => comment.status === tab);
  const empty = emptyCopy(tab, comments.length, scope);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cards inherit `hidden` → `visible` from this list, so they stagger in on mount. */}
      <motion.ul
        ref={listRef}
        variants={stagger}
        initial="hidden"
        animate="visible"
        aria-label={tab === "active" ? "Active comments" : "Resolved comments"}
        // `relative`: popLayout positions cards leaving for the other tab against this list.
        className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
      >
        <AnimatePresence mode="popLayout">
          {shown.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              number={numbers.get(comment.id) ?? 0}
              placement={placements.get(comment.id) ?? null}
              page={pageOf?.(comment) ?? null}
              canModerate={canModerate}
              selected={comment.id === selectedId}
              now={now}
              {...actions}
            />
          ))}
          {shown.length === 0 ? (
            <motion.li
              key={`empty-${tab}`}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              data-testid="comments-empty"
              className="rounded-tile border border-dashed border-field-line px-4 py-8 text-center"
            >
              <p className="text-body font-semibold">{empty.title}</p>
              <p className="mt-1 text-meta text-muted">{empty.body}</p>
            </motion.li>
          ) : null}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
