"use client";

import { motion, useIsPresent } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Comment, CommentPriority, Reply } from "@/lib/store/types";
import { useDockAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { useMediaQuery } from "@/lib/use-media-query";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ClientMark } from "./ClientMark";
import { CommentAuthorAvatar } from "./CommentAuthorAvatar";
import { CommentBadge } from "./CommentBadge";
import { CommentEdited } from "./CommentEdited";
import { CommentMoreMenu } from "./CommentMoreMenu";
import { CommentTeamNote } from "./CommentTeamNote";
import { CommentThread } from "./CommentThread";
import { CopyLinkButton } from "./CopyLinkButton";
import { showsReplyBox, useCommentThreads } from "./comment-threads";
import { PlacementChip } from "./PlacementChip";
import { PriorityChip } from "./PriorityChip";
import { replyClosedNote } from "./reply-rights";
import { ReplyComposer } from "./ReplyComposer";
import { ReplySlot } from "./ReplySlot";
import { useOverflowing } from "./use-overflowing";
import type { Placement } from "./surface";

interface PinPopoverProps {
  /** DOM id, referenced by the pin's `aria-controls`. */
  id: string;
  comment: Comment;
  number: number;
  placement: Placement | null;
  now: number;
  /** The owner only: shows Resolve or Reopen, and marks client comments. */
  canModerate: boolean;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  /** The team's "Get info" (browser details) in the More menu; guests get none. */
  onGetInfo?: () => void;
  /** The team's Priority choices in the More menu (D10); guests get none. */
  onSetPriority?: (priority: CommentPriority | null) => void;
  /** Copies the comment's link (the header's button, everyone's); true once the clipboard has it. */
  onCopyLink: () => Promise<boolean>;
  /** `returnFocus`: closed from the keyboard or the close button, so focus goes back to the pin. */
  onClose: (returnFocus: boolean) => void;
}

interface Side {
  horizontal: "right" | "left";
  vertical: "down" | "up";
  /** Px slid sideways to stay inside the stage when neither side has the popover's width. */
  shift: number;
}

/** Space kept between the popover and the stage's edges, in px. */
const MARGIN = 8;
/** The pin button's width: the popover starts just past it on the right. */
const PIN_WIDTH = 44;
/** How far above the pin's point its marker's top sits. */
const PIN_HEAD = 36;

const NO_REPLIES: readonly Reply[] = [];

/** The docked popover's cap (`max-h-[50dvh]`), which the keyboard can only lower. */
const DOCKED_MAX = "50dvh";

/**
 * The least the docked popover's scroller keeps, in px (its content's height when that's less):
 * a reply box with its name field and an error can't squeeze the comment and thread out of
 * sight. The popover itself scrolls should both not fit.
 */
const DOCKED_SCROLL_MIN = 96;

/** The thread's hairline (`CommentThread`'s), over the reply box while there's no thread yet. */
const BOX_RULE = "mt-1 border-t border-line pt-3";

const TRANSLATE = {
  right: "2.75rem",
  left: "calc(-100% - 0.5rem)",
  down: "-2.25rem",
  up: "calc(-100% + 0.5rem)",
} as const;

/** A first guess from the pin's position, refined once the popover can be measured. */
function guess({ x, y }: Comment): Side {
  return { horizontal: x > 60 ? "left" : "right", vertical: y > 55 ? "up" : "down", shift: 0 };
}

function sameSide(a: Side, b: Side): boolean {
  return a.horizontal === b.horizontal && a.vertical === b.vertical && a.shift === b.shift;
}

/**
 * The side of the pin with room for the popover inside the visible stage
 * (the scrolling canvas, cut to the window), else the side with more room,
 * slid sideways as far as it takes to keep it inside.
 */
function measure(node: HTMLElement, { x, y }: Comment): Side | null {
  const layer = node.parentElement?.getBoundingClientRect();
  if (!layer || layer.width === 0) return null;
  const stage = node.closest("main")?.getBoundingClientRect();
  const left = Math.max(stage?.left ?? 0, 0) + MARGIN;
  const right = Math.min(stage?.right ?? window.innerWidth, window.innerWidth) - MARGIN;
  const top = Math.max(stage?.top ?? 0, 0) + MARGIN;
  const bottom = Math.min(stage?.bottom ?? window.innerHeight, window.innerHeight) - MARGIN;
  const anchorX = layer.left + (layer.width * x) / 100;
  const anchorY = layer.top + (layer.height * y) / 100;
  const roomRight = right - (anchorX + PIN_WIDTH);
  const roomLeft = anchorX - MARGIN - left;
  const roomDown = bottom - (anchorY - PIN_HEAD);
  const roomUp = anchorY + MARGIN - top;
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  const horizontal = roomRight >= width || roomRight >= roomLeft ? "right" : "left";
  const start = horizontal === "right" ? anchorX + PIN_WIDTH : anchorX - MARGIN - width;
  // The left edge wins: on a stage narrower than the popover, its start stays in view.
  const clamped = Math.max(left, Math.min(start, right - width));
  return {
    horizontal,
    vertical: roomDown >= height || roomDown >= roomUp ? "down" : "up",
    shift: Math.round(clamped - start),
  };
}

/**
 * A pin's comment, opened from the pin: who said it (their avatar, with the
 * company badge for the team) and when, the full text,
 * where it was placed, Copy link beside Close, and (for the team) Resolve or
 * Reopen, the More menu (Priority, Get info), the whole thread and
 * the reply box (U1). A non-modal
 * dialog beside the pin, flipped (and if need be slid) to stay inside the stage; docked to the
 * bottom on phones, like the composer. Between its header and the reply box
 * it scrolls, so a long thread never pushes either away. Escape, the close
 * button, a click outside or another pin close it.
 */
export function PinPopover({
  id,
  comment,
  number,
  placement,
  now,
  canModerate,
  onResolve,
  onReopen,
  onGetInfo,
  onSetPriority,
  onCopyLink,
  onClose,
}: PinPopoverProps) {
  const docked = !useMediaQuery("(min-width: 640px)");
  const variants = usePopVariants();
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>(() => guess(comment));
  const titleId = useId();
  const bodyId = useId();
  const editedId = useId();
  const placementId = useId();
  const priorityId = useId();
  const resolved = comment.status === "resolved";
  const threads = useCommentThreads();
  const replies = threads?.repliesOf(comment.id) ?? NO_REPLIES;
  const { boxRef, contentRef, overflowing, contentHeight } = useOverflowing();
  // Docked, the reply box sits at the bottom of the screen, where a phone's keyboard opens.
  useDockAboveKeyboard(ref, docked, DOCKED_MAX);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Before paint, so the popover never shows on the wrong side first; again (once a frame at
  // most) as the stage scrolls or the window resizes, since either moves the stage's edges.
  useLayoutEffect(() => {
    const node = ref.current;
    if (docked || !node) return;
    const update = () => {
      const measured = measure(node, comment);
      if (measured) setSide((current) => (sameSide(current, measured) ? current : measured));
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    const stage = node.closest("main");
    stage?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // A reply sent, an editor opened or an error shown makes it taller: it may need the other side.
    const growth = new ResizeObserver(schedule);
    growth.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      stage?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      growth.disconnect();
    };
  }, [docked, comment]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [comment.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A modal dialog on top (such as a screenshot) handles its own Escape.
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      // A reply's editor in here took this Escape to cancel; the next one closes the popover.
      if (event.defaultPrevented) return;
      // An open menu in here (More) takes this Escape; the next one closes the popover. Its own
      // stopPropagation can't stop this listener, which sits on the same node as React's.
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      // Closing re-enables the viewer's Escape shortcut before the event reaches the window.
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      // A modal dialog opened from here (Get info) takes its own clicks, the backdrop's too.
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = event.target as Element | null;
      // Pins handle their own clicks: the same pin toggles, another one switches.
      if (ref.current?.contains(target) || target?.closest("[data-pin-id]")) return;
      // So does this comment's card, where selecting it moves the thread there in one go (`select`):
      // its select surface only, so its Resolve, Edit, Delete or More still close the popover.
      const card = target?.closest(`[data-comment-id="${CSS.escape(comment.id)}"]`);
      if (card && target?.closest("[data-card-select]")) return;
      onCloseRef.current(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [comment.id]);

  const origin = `${side.horizontal === "right" ? "left" : "right"} ${
    side.vertical === "down" ? "top" : "bottom"
  }`;

  return (
    <motion.div
      ref={ref}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={[
        bodyId,
        comment.editedAt ? editedId : null,
        comment.priority ? priorityId : null,
      ]
        .filter(Boolean)
        .join(" ")}
      tabIndex={-1}
      data-testid="pin-popover"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={(event) => event.stopPropagation()}
      style={
        docked
          ? undefined
          : {
              left: `${comment.x}%`,
              top: `${comment.y}%`,
              translate: `calc(${TRANSLATE[side.horizontal]} + ${side.shift}px) ${TRANSLATE[side.vertical]}`,
              transformOrigin: origin,
            }
      }
      data-thread-scope
      className={`${present ? "pointer-events-auto" : "pointer-events-none"} z-40 flex flex-col gap-2 rounded-card bg-panel p-4 pt-2 shadow-pop ring-1 ring-line focus:outline-none ${
        docked
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[50dvh] overflow-y-auto"
          : "absolute max-h-[min(36rem,calc(100dvh-6rem))] w-76"
      }`}
    >
      <div className="-mr-2 flex shrink-0 items-center gap-2">
        <span aria-hidden="true" className="flex">
          <CommentBadge comment={comment} number={number} />
        </span>
        <CommentAuthorAvatar comment={comment} surface="panel" />
        {/*
         * The time sits under the name, not beside it: in the 304px popover, the avatar, the
         * close button and a time like "10 minutes ago" on one line left a client's name (with
         * its Client chip) under 20px.
         */}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            id={titleId}
            className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold"
          >
            {/*
             * Two lines, not one: with the Client chip, a single line left room for about
             * seven characters of the name in the 304px popover, where the comment is read in full.
             * With Copy link and Close beside it, the chip wraps under a name it doesn't fit beside,
             * so the name keeps the column's full width rather than breaking mid-word.
             */}
            <span className="line-clamp-2 min-w-0 wrap-break-word">
              <span className="sr-only">Comment {number} by </span>
              {comment.author}
              <CommentTeamNote comment={comment} />
            </span>
            <ClientMark comment={comment} owner={canModerate} />
            {resolved ? <span className="sr-only">, resolved</span> : null}
          </h2>
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            title={absoluteTime(comment.createdAt)}
            className="text-label text-muted"
          >
            {relativeTime(comment.createdAt, now)}
          </time>
        </div>
        {/* Side by side with no gap: each keeps its 44px target, and the name keeps the room. */}
        <div className="flex shrink-0">
          <CopyLinkButton number={number} onCopy={onCopyLink} testId="popover-copy-link" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="text-muted hover:text-ink"
            onClick={() => onClose(true)}
          >
            <Icon name="close" className="size-4" />
          </Button>
        </div>
      </div>
      {/*
       * The comment, its actions and its thread, scrolling once they outgrow the popover (a long
       * thread, a phone's half screen) and clipping nothing until then, so a menu can spill out.
       * Its padding keeps focus rings off its edges; a menu in it opens where there's room.
       */}
      <div
        ref={boxRef}
        data-menu-bounds
        style={docked ? { minHeight: Math.min(contentHeight, DOCKED_SCROLL_MIN) } : undefined}
        className={`-mx-4 -my-1 min-h-0 ${overflowing ? "overflow-y-auto" : "overflow-visible"}`}
      >
        <div ref={contentRef} className="flex flex-col gap-2 px-4 py-1">
          <p id={bodyId} className="text-body break-words whitespace-pre-wrap text-ink-2">
            {comment.body}
          </p>
          <CommentEdited id={editedId} editedAt={comment.editedAt} now={now} />
          <PriorityChip id={priorityId} priority={comment.priority} className="self-start" />
          {placement ? <PlacementChip id={placementId} placement={placement} now={now} /> : null}
          {canModerate || onGetInfo ? (
            <div className="flex items-center justify-end gap-1 pt-1">
              {!canModerate ? null : resolved ? (
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
              {onGetInfo && onSetPriority ? (
                <CommentMoreMenu
                  number={number}
                  priority={comment.priority ?? null}
                  onSetPriority={onSetPriority}
                  onGetInfo={onGetInfo}
                />
              ) : null}
            </div>
          ) : null}
          {threads ? (
            <CommentThread
              replies={replies}
              number={number}
              threads={threads}
              surface="panel"
              now={now}
              className="mt-1 border-t border-line pt-3"
            />
          ) : null}
        </div>
      </div>
      {threads ? (
        // Before any reply, the thread's rule (12px either side) sits over the box, as on a card.
        <div className={`shrink-0 ${replies.length > 0 ? "pt-1" : BOX_RULE}`}>
          <ReplySlot
            box={
              showsReplyBox(threads, comment) ? (
                <ReplyComposer
                  authorName={threads.authorName}
                  onSend={(draft) => threads.send(comment, draft)}
                  initialBody={threads.draftOf(comment.id)}
                  onDraftChange={(body) => threads.keepDraft(comment.id, body)}
                />
              ) : null
            }
            note={replyClosedNote(threads.viewer, comment)}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
