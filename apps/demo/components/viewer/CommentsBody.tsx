"use client";

import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { Comment } from "@/lib/store/types";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CommentCard, type CommentCardActions } from "./CommentCard";
import type { CommentTab } from "./types";

interface CommentsBodyProps extends CommentCardActions {
  comments: readonly Comment[];
  numbers: ReadonlyMap<string, number>;
  tab: CommentTab;
  onTab: (tab: CommentTab) => void;
  selectedId: string | null;
  now: number;
  listRef: RefObject<HTMLUListElement | null>;
}

function emptyCopy(tab: CommentTab, total: number) {
  if (tab === "resolved") {
    return { title: "Nothing resolved yet", body: "Resolved comments show up here." };
  }
  return total === 0
    ? {
        title: "No comments yet",
        body: "Choose Comment (or press C), then click or tap anywhere to drop a pin.",
      }
    : { title: "All caught up", body: "Every comment here is resolved." };
}

const stagger = staggerGroup();

/** Active / Resolved switcher and the comment list for the selected tab. */
export function CommentsBody({
  comments,
  numbers,
  tab,
  onTab,
  selectedId,
  now,
  listRef,
  ...actions
}: CommentsBodyProps) {
  const variants = useRevealVariants();
  const active = comments.filter((comment) => comment.status === "active");
  const resolved = comments.filter((comment) => comment.status === "resolved");
  const shown = tab === "active" ? active : resolved;
  const empty = emptyCopy(tab, comments.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="px-3">
        <SegmentedControl
          label="Comment status"
          layoutId="comment-tab-thumb"
          stretch
          value={tab}
          onChange={onTab}
          options={[
            { value: "active", label: `Active (${active.length})`, testId: "tab-active" },
            { value: "resolved", label: `Resolved (${resolved.length})`, testId: "tab-resolved" },
          ]}
        />
      </div>
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
