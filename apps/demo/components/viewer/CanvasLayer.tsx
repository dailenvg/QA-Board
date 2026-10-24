"use client";

import { AnimatePresence } from "motion/react";
import type { Ref } from "react";
import type { Comment } from "@/lib/store/types";
import { CommentOverlay } from "./CommentOverlay";
import { Composer } from "./Composer";
import { Pin } from "./Pin";
import type { CommentTab, Draft, PinPoint, ViewerMode } from "./types";

interface CanvasLayerProps {
  comments: readonly Comment[];
  numbers: ReadonlyMap<string, number>;
  tab: CommentTab;
  mode: ViewerMode;
  selectedId: string | null;
  draft: Draft | null;
  authorName: string | null;
  composerRef: Ref<HTMLTextAreaElement>;
  overlayRef: Ref<HTMLDivElement>;
  onSelect: (id: string) => void;
  onPlace: (point: PinPoint) => void;
  onExitComment: () => void;
  onDraftChange: (body: string) => void;
  onDraftSubmit: (body: string, author: string) => void;
  onDraftCancel: () => void;
}

/**
 * Everything drawn over the preview. Pins never block the page in Browse mode;
 * the click catcher only exists in Comment mode. Resolved pins appear (muted)
 * only on the Resolved tab.
 */
export function CanvasLayer({
  comments,
  numbers,
  tab,
  mode,
  selectedId,
  draft,
  authorName,
  composerRef,
  overlayRef,
  onSelect,
  onPlace,
  onExitComment,
  onDraftChange,
  onDraftSubmit,
  onDraftCancel,
}: CanvasLayerProps) {
  const visible =
    tab === "active" ? comments.filter((comment) => comment.status === "active") : comments;
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit]">
      {mode === "comment" ? (
        <div className="pointer-events-auto absolute inset-0">
          <CommentOverlay ref={overlayRef} onPlace={onPlace} onExit={onExitComment} />
        </div>
      ) : null}
      <AnimatePresence>
        {visible.map((comment) => {
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
              selected={comment.id === selectedId}
              label={`Comment ${number} by ${comment.author}${resolved ? ", resolved" : ""}`}
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
      <AnimatePresence>
        {draft ? (
          <div key="composer" className="pointer-events-auto">
            <Composer
              draft={draft}
              authorName={authorName}
              textareaRef={composerRef}
              onChange={onDraftChange}
              onSubmit={onDraftSubmit}
              onCancel={onDraftCancel}
            />
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
