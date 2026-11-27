"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type RefObject } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { Breakpoint } from "@/lib/store/breakpoints";
import type { PinNumber } from "@/lib/store/pin-numbers";
import type { Comment } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { StateArt } from "../ui/line-art/StateArt";
import { CommentCard, type CommentCardActions } from "./CommentCard";
import { commentRights } from "./comment-rights";
import { listedOnTab } from "./listed-on-tab";
import type { Placement } from "./surface";
import type { CommentTab } from "./types";

interface CommentsBodyProps extends CommentCardActions {
  comments: readonly Comment[];
  numbers: ReadonlyMap<string, PinNumber>;
  placements: ReadonlyMap<string, Placement | null>;
  /** False on a shared link: comments can be read and selected, not changed. */
  canModerate: boolean;
  /** The workspace's owner (`comment.moderate`): may delete anyone's comment. */
  moderator: boolean;
  /** A shared link still takes its guest's edits (its review window is open). */
  reviewOpen: boolean;
  /** Picked in the panel's header (`PanelHeading`). */
  tab: CommentTab;
  selectedId: string | null;
  /** The comment whose pin's popover is open: its card leaves the thread to the popover. */
  openId?: string | null;
  now: number;
  listRef: RefObject<HTMLUListElement | null>;
  /**
   * The breakpoint being listed, when the project has comments at another
   * one: an empty list then says where it's empty ("No comments on Mobile yet",
   * "Nothing resolved on Mobile yet").
   */
  scope?: string;
  /** Page numbers by page id, on projects with several pages: each card says its page. */
  pageNumbers?: ReadonlyMap<string, number>;
  /** Breakpoints by comment id, while the list shows every breakpoint's: each card says its own. */
  breakpoints?: ReadonlyMap<string, Breakpoint>;
  /** Pins in surface px by comment id (`pinInSurface`), for the crop thumbnails. */
  cropPins: ReadonlyMap<string, { x: number; y: number } | null>;
  /**
   * Set while the priority filter hides comments on this tab: an empty list then says so
   * (`title`, "No Must fix comments here") and offers Show all.
   */
  filteredOut?: { title: string; onShowAll: () => void } | null;
}

const FILTERED_OUT_BODY = "Change the filter to see the rest.";

function emptyCopy(tab: CommentTab, total: number, scope: string | undefined) {
  if (tab === "resolved") {
    return {
      title: scope ? `Nothing resolved on ${scope} yet` : "Nothing resolved yet",
      body: "Resolved comments show up here.",
      scene: "resolved",
    } as const;
  }
  return total === 0
    ? ({
        title: scope ? `No comments on ${scope} yet` : "No comments yet",
        body: "Choose Comment (or press C), then click or tap anywhere to drop a pin.",
        scene: "comments",
      } as const)
    : ({
        title: "All caught up",
        body: "Every comment here is resolved.",
        scene: "caughtUp",
      } as const);
}

const stagger = staggerGroup();

/**
 * Focus for a card that leaves once its editor closes (resolved or deleted
 * meanwhile), as after a delete (`focusAfterRemoval`): the card after it,
 * else the one before, else the panel's heading, never the page. Two frames:
 * after the card has tried to keep it.
 */
function focusAfterLeaving(shown: readonly Comment[], id: string) {
  const at = shown.findIndex((comment) => comment.id === id);
  const neighbour = at < 0 ? undefined : (shown[at + 1] ?? shown[at - 1]);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const card = neighbour
        ? document.querySelector<HTMLElement>(
            `[data-comment-id="${CSS.escape(neighbour.id)}"] [data-card-select]`,
          )
        : null;
      if (card) {
        card.focus();
        return;
      }
      const heading = document.querySelector<HTMLElement>('[data-testid="comments-panel"] h2');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus();
    }),
  );
}

/** The comment list for the selected tab, with its empty states. */
export function CommentsBody({
  comments,
  numbers,
  placements,
  canModerate,
  moderator,
  reviewOpen,
  tab,
  selectedId,
  openId = null,
  now,
  listRef,
  scope,
  pageNumbers,
  breakpoints,
  cropPins,
  filteredOut = null,
  ...actions
}: CommentsBodyProps) {
  const variants = useRevealVariants();
  /** Comments whose editor is open, as they were when it opened (`listedOnTab`). */
  const [editing, setEditing] = useState<ReadonlyMap<string, Comment>>(new Map());
  const shown = listedOnTab(comments, tab, editing);
  const onEditing = (comment: Comment, open: boolean) => {
    setEditing((current) => {
      const next = new Map(current);
      if (open) next.set(comment.id, comment);
      else next.delete(comment.id);
      return next;
    });
    const stays = comments.some((entry) => entry.id === comment.id && entry.status === tab);
    if (!open && !stays) focusAfterLeaving(shown, comment.id);
  };
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
        // A card's More menu opens above its trigger when the list's visible part has no room below.
        data-menu-bounds
        // `relative`: popLayout positions cards leaving for the other tab against this list.
        className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
      >
        <AnimatePresence mode="popLayout">
          {shown.map((comment) => {
            const rights = commentRights(comment, { team: canModerate, moderator, reviewOpen });
            return (
              <CommentCard
                key={comment.id}
                comment={comment}
                number={numbers.get(comment.id)?.label ?? ""}
                placement={placements.get(comment.id) ?? null}
                pageNumber={(comment.pageId && pageNumbers?.get(comment.pageId)) || null}
                breakpoint={breakpoints?.get(comment.id) ?? null}
                cropPin={cropPins.get(comment.id) ?? null}
                canModerate={canModerate}
                canEdit={rights.edit}
                canDelete={rights.delete !== null}
                resolvedNote={rights.resolvedNote}
                onEditing={onEditing}
                selected={comment.id === selectedId}
                threadInPopover={comment.id === openId}
                now={now}
                {...actions}
              />
            );
          })}
          {shown.length === 0 ? (
            <motion.li
              key={`empty-${tab}${filteredOut ? "-filtered" : ""}`}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              data-testid="comments-empty"
              className="flex flex-col items-center rounded-tile px-4 py-6 text-center"
            >
              {filteredOut ? (
                <>
                  <StateArt scene="noMatch" size="md" still className="mb-3" />
                  <p className="text-body font-semibold">{filteredOut.title}</p>
                  <p className="mt-1 text-meta text-muted">{FILTERED_OUT_BODY}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={filteredOut.onShowAll}
                    data-testid="comments-show-all"
                  >
                    Show all
                  </Button>
                </>
              ) : (
                <>
                  <StateArt scene={empty.scene} size="md" still className="mb-3" />
                  <p className="text-body font-semibold">{empty.title}</p>
                  <p className="mt-1 text-meta text-muted">{empty.body}</p>
                </>
              )}
            </motion.li>
          ) : null}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
