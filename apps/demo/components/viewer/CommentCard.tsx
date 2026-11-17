"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { instant, spring, useRevealVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Comment } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ClientMark } from "./ClientMark";
import { CommentAuthorAvatar } from "./CommentAuthorAvatar";
import { CommentBadge } from "./CommentBadge";
import { CommentCropThumb } from "./CommentCropThumb";
import { CommentEdited } from "./CommentEdited";
import { CommentEditor } from "./CommentEditor";
import { CommentTeamNote } from "./CommentTeamNote";
import { PlacementChip } from "./PlacementChip";
import type { Placement } from "./surface";

export interface CommentCardActions {
  onSelect: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (comment: Comment) => void;
}

interface CommentCardProps extends CommentCardActions {
  comment: Comment;
  number: number;
  /** Where the pin lives, when that isn't the current snapshot. */
  placement: Placement | null;
  /** The page it's on, on projects with several pages. */
  pageNumber: number | null;
  /**
   * The workspace's viewer: shows Resolve/Reopen (anyone in the workspace),
   * and marks client comments. Off on a shared link, which shows no actions.
   */
  canModerate: boolean;
  /** Shows Edit: the signed-in member's own comment (`commentRights`). */
  canEdit: boolean;
  /** Shows Delete: their own, or anyone's for the owner (`commentRights`). */
  canDelete: boolean;
  selected: boolean;
  now: number;
}

/**
 * One comment: select it to find its pin (switching to its snapshot if
 * needed); see what the commenter saw; resolve or reopen it, and edit or
 * delete it where that's the member's to do.
 */
export function CommentCard({
  comment,
  number,
  placement,
  pageNumber,
  canModerate,
  canEdit,
  canDelete,
  selected,
  now,
  onSelect,
  onEdit,
  onResolve,
  onReopen,
  onDelete,
}: CommentCardProps) {
  const [editing, setEditing] = useState(false);
  const reduce = useReducedMotion();
  const variants = useRevealVariants();
  const itemRef = useRef<HTMLLIElement>(null);
  const bodyId = useId();
  const editedId = useId();
  const placementId = useId();
  const pageId = useId();
  const described = [
    bodyId,
    comment.editedAt ? editedId : null,
    pageNumber ? pageId : null,
    placement ? placementId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const resolved = comment.status === "resolved";
  // Without the action row (shared link), this keeps the card's bottom inset at 16px.
  const bottomInset = canModerate ? "" : "pb-2";

  /** Closing the editor hands focus back to the Edit button instead of dropping it to the page. */
  const finishEditing = () => {
    setEditing(false);
    requestAnimationFrame(() =>
      itemRef.current?.querySelector<HTMLElement>("[data-edit-trigger]")?.focus(),
    );
  };

  return (
    // `initial`/`animate` come from the list, so cards stagger in on mount.
    <motion.li
      ref={itemRef}
      layout={reduce ? false : "position"}
      variants={variants}
      exit="exit"
      data-testid="comment-card"
      data-comment-id={comment.id}
      // One color for the card and its avatar's badge ring (`--avatar-surface`): the card at
      // rest; on hover, the 60% hover tint over the panel, made opaque so the ring can match it;
      // the hover color when pressed. The list always sits on the panel.
      className={`relative rounded-tile bg-(--avatar-surface) transition-colors [--avatar-surface:var(--color-card)] has-[[data-card-select]:hover]:[--avatar-surface:color-mix(in_srgb,var(--color-hover)_60%,var(--color-panel))] has-[[data-card-select]:active]:[--avatar-surface:var(--color-hover)] has-[[data-card-select]:focus-visible]:ring-2 has-[[data-card-select]:focus-visible]:ring-focus ${bottomInset}`}
    >
      {selected ? (
        <motion.span
          layoutId="comment-selection"
          transition={reduce ? instant : spring.snappy}
          // brand-text, not brand: cobalt is only 2.5:1 on dark cards, the dark-theme variant 7.8:1.
          className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-brand-text"
        />
      ) : null}

      {editing ? (
        <CommentEditor
          initialBody={comment.body}
          onCancel={finishEditing}
          onSave={(body) => {
            onEdit(comment.id, body);
            finishEditing();
          }}
        />
      ) : (
        <div className="p-4 pb-2">
          {/*
           * The button's name is its visible header ("Comment 1 by Ana, 2m ago"), so the
           * spoken name matches what's on screen (WCAG 2.5.3). Its ::after stretches over the
           * whole card, so the comment text below stays clickable; it's read as the description.
           * The header matches the pin's popover: the name (and Client chip) over the time, in
           * one column beside the avatar. Spans only, since a button holds phrasing content.
           */}
          <button
            type="button"
            data-card-select
            aria-pressed={selected}
            aria-describedby={described}
            onClick={() => onSelect(comment.id)}
            className="flex w-full items-center gap-2 text-left after:absolute after:inset-0 after:rounded-tile focus-visible:outline-none"
          >
            <CommentBadge comment={comment} number={number} />
            <CommentAuthorAvatar comment={comment} surface="card" />
            <span className="flex min-w-0 flex-1 flex-col">
              {/* As tall as the Client pin, so cards match with or without it. */}
              <span className="flex min-h-6 min-w-0 items-center gap-2 text-body font-semibold">
                {/* One line, not the popover's two: the list is scanned, and the card has the room. */}
                <span className="min-w-0 truncate">
                  <span className="sr-only">by </span>
                  {comment.author}
                  <CommentTeamNote comment={comment} />
                </span>
                <ClientMark comment={comment} owner={canModerate} />
              </span>
              <time
                dateTime={new Date(comment.createdAt).toISOString()}
                title={absoluteTime(comment.createdAt)}
                className="text-label text-muted"
              >
                <span className="sr-only">, </span>
                {relativeTime(comment.createdAt, now)}
              </time>
            </span>
          </button>
          <p id={bodyId} className="mt-2 text-body break-words whitespace-pre-wrap text-ink-2">
            {comment.body}
          </p>
          <CommentEdited id={editedId} editedAt={comment.editedAt} now={now} className="mt-1" />
          {pageNumber ? (
            <p
              id={pageId}
              data-testid="comment-page"
              // Same chip as PlacementChip's (8px gap, 12px by 4px padding), on the 4px grid.
              className="mt-2 inline-flex items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2"
            >
              <Icon name="image" className="size-3.5" />
              Page {pageNumber}
            </p>
          ) : null}
          {placement ? <PlacementChip id={placementId} placement={placement} now={now} /> : null}
        </div>
      )}

      {editing || !comment.crop ? null : <CommentCropThumb crop={comment.crop} number={number} />}

      {editing || !canModerate ? null : (
        // `relative` lifts the actions above the select button's card-wide ::after.
        <div className="relative flex items-center gap-1 px-2 pb-2">
          {resolved ? (
            <Button variant="secondary" size="sm" onClick={() => onReopen(comment.id)}>
              <Icon name="undo" className="size-4" />
              Reopen
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onResolve(comment.id)}>
              <Icon name="check" className="size-4" />
              Resolve
            </Button>
          )}
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Edit comment ${number}`}
              data-edit-trigger
            >
              <Icon name="pencil" className="size-4" />
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-muted hover:text-danger"
              onClick={() => onDelete(comment)}
              aria-label={`Delete comment ${number}`}
              title="Delete"
            >
              <Icon name="trash" className="size-4" />
            </Button>
          ) : null}
        </div>
      )}
    </motion.li>
  );
}
