"use client";

import { motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Comment } from "@/lib/store/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CommentBadge } from "./CommentBadge";
import { PlacementChip } from "./PlacementChip";
import type { Placement } from "./surface";

interface PinPopoverProps {
  /** DOM id, referenced by the pin's `aria-controls`. */
  id: string;
  comment: Comment;
  number: number;
  placement: Placement | null;
  now: number;
  /** Shows Resolve or Reopen (the owner only). */
  canModerate: boolean;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
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
 * A pin's comment, opened from the pin: who said it and when, the full text,
 * where it was placed, and (for the owner) Resolve or Reopen. A non-modal
 * dialog beside the pin, flipped (and if need be slid) to stay inside the stage; docked to the
 * bottom on phones, like the composer. Escape, the close button, a click
 * outside or another pin close it.
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
  onClose,
}: PinPopoverProps) {
  const docked = !useMediaQuery("(min-width: 640px)");
  const variants = usePopVariants();
  const ref = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>(() => guess(comment));
  const titleId = useId();
  const bodyId = useId();
  const placementId = useId();
  const resolved = comment.status === "resolved";
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
    return () => {
      cancelAnimationFrame(frame);
      stage?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [docked, comment]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [comment.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A modal dialog on top (such as a screenshot) handles its own Escape.
      if (event.key !== "Escape" || document.querySelector('[aria-modal="true"]')) return;
      // Closing re-enables the viewer's Escape shortcut before the event reaches the window.
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // Pins handle their own clicks: the same pin toggles, another one switches.
      if (ref.current?.contains(target) || target?.closest("[data-pin-id]")) return;
      onCloseRef.current(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  const origin = `${side.horizontal === "right" ? "left" : "right"} ${
    side.vertical === "down" ? "top" : "bottom"
  }`;

  return (
    <motion.div
      ref={ref}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
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
      className={`pointer-events-auto z-40 flex flex-col gap-2 rounded-card bg-panel p-4 pt-2 shadow-pop ring-1 ring-line focus:outline-none ${
        docked
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "absolute w-76"
      }`}
    >
      <div className="-mr-2 flex items-center gap-2">
        <span aria-hidden="true" className="flex">
          <CommentBadge comment={comment} number={number} />
        </span>
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-body font-semibold">
          <span className="sr-only">Comment {number} by </span>
          {comment.author}
          {resolved ? <span className="sr-only">, resolved</span> : null}
        </h2>
        <time
          dateTime={new Date(comment.createdAt).toISOString()}
          title={absoluteTime(comment.createdAt)}
          className="shrink-0 text-label text-muted"
        >
          {relativeTime(comment.createdAt, now)}
        </time>
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
      <p
        id={bodyId}
        className="max-h-60 overflow-y-auto text-body break-words whitespace-pre-wrap text-ink-2"
      >
        {comment.body}
      </p>
      {placement ? <PlacementChip id={placementId} placement={placement} now={now} /> : null}
      {canModerate ? (
        <div className="flex justify-end pt-1">
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
        </div>
      ) : null}
    </motion.div>
  );
}
