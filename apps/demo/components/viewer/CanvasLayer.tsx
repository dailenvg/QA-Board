"use client";

import { AnimatePresence } from "motion/react";
import type { ReactNode, Ref, RefObject } from "react";
import { PRIORITY_LABEL } from "@/lib/store/priority";
import type { Comment, CommentPriority } from "@/lib/store/types";
import { CommentOverlay } from "./CommentOverlay";
import { Composer } from "./Composer";
import { Pin } from "./Pin";
import type { Draft, PinPoint, ViewerMode } from "./types";

interface CanvasLayerProps {
  /** The pins to draw: this surface's comments shown on the current tab. */
  comments: readonly Comment[];
  numbers: ReadonlyMap<string, number>;
  mode: ViewerMode;
  selectedId: string | null;
  /** The comment whose popover is open, and that popover's element id. */
  openId: string | null;
  popoverId: string;
  /** The open pin's popover (`PinPopover`); never shown while a draft is being written. */
  popover: ReactNode;
  draft: Draft | null;
  authorName: string | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  overlayRef: Ref<HTMLDivElement>;
  onSelect: (id: string) => void;
  onPlace: (point: PinPoint) => void;
  onExitComment: () => void;
  onDraftChange: (body: string) => void;
  onDraftAuthorChange: (author: string) => void;
  onDraftPriorityChange: (priority: CommentPriority | undefined) => void;
  onDraftSubmit: (body: string, author: string) => void;
  onDraftCancel: () => void;
}

/** "Comment 3 by Ana", then ", resolved" and ", must fix" as they apply. */
function pinLabel(number: number, { author, status, priority }: Comment): string {
  const resolved = status === "resolved" ? ", resolved" : "";
  return `Comment ${number} by ${author}${resolved}${priority ? `, ${spoken(priority)}` : ""}`;
}

const spoken = (priority: CommentPriority) => PRIORITY_LABEL[priority].toLowerCase();

/**
 * Everything drawn over the preview. Pins never block the page in Browse mode;
 * the click catcher only exists in Comment mode. A pin opens its comment's
 * popover beside it.
 */
export function CanvasLayer({
  comments,
  numbers,
  mode,
  selectedId,
  openId,
  popoverId,
  popover,
  draft,
  authorName,
  composerRef,
  overlayRef,
  onSelect,
  onPlace,
  onExitComment,
  onDraftChange,
  onDraftAuthorChange,
  onDraftPriorityChange,
  onDraftSubmit,
  onDraftCancel,
}: CanvasLayerProps) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit]">
      {mode === "comment" ? (
        <div className="pointer-events-auto absolute inset-0">
          <CommentOverlay ref={overlayRef} onPlace={onPlace} onExit={onExitComment} />
        </div>
      ) : null}
      <AnimatePresence>
        {comments.map((comment) => {
          const number = numbers.get(comment.id) ?? 0;
          const resolved = comment.status === "resolved";
          return (
            <Pin
              key={comment.id}
              id={comment.id}
              number={number}
              x={comment.x}
              y={comment.y}
              tone={resolved ? "resolved" : "active"}
              author={comment.author}
              priority={comment.priority}
              selected={comment.id === selectedId}
              expanded={comment.id === openId}
              popoverId={popoverId}
              label={pinLabel(number, comment)}
              onSelect={() => onSelect(comment.id)}
            />
          );
        })}
        {draft ? (
          <Pin
            key="draft"
            number={null}
            x={draft.x}
            y={draft.y}
            tone={draft.error ? "unsent" : "draft"}
            label={draft.error ? "Unsent comment position" : "New comment position"}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>{draft ? null : popover}</AnimatePresence>
      <AnimatePresence>
        {draft ? (
          // Keyed by the draft: a click while the last composer fades out mounts a fresh one
          // (its own state and focus) instead of reviving the leaving one. A retry keeps the draft.
          <div key={draft.commentId}>
            <Composer
              draft={draft}
              authorName={authorName}
              textareaRef={composerRef}
              onChange={onDraftChange}
              onAuthorChange={onDraftAuthorChange}
              onPriorityChange={onDraftPriorityChange}
              onSubmit={onDraftSubmit}
              onCancel={onDraftCancel}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
