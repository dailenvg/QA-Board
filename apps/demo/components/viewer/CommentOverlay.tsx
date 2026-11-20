"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { lastInputWasKeyboard } from "@/lib/last-input";
import type { PinPoint } from "./types";

interface CommentOverlayProps {
  onPlace: (point: PinPoint) => void;
  onExit: () => void;
  /** Lets the viewer return focus here after the composer closes. */
  ref?: Ref<HTMLDivElement>;
}

const STEP = 2;
const BIG_STEP = 10;
const clamp = (value: number) => Math.min(100, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Centre of the part of the canvas on screen, so the keyboard crosshair
 * starts where the user is looking on a tall snapshot.
 */
function visibleCentre(node: HTMLElement): PinPoint {
  const box = node.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return { x: 50, y: 50 };
  const frame = node.closest("main")?.getBoundingClientRect();
  const top = Math.max(box.top, frame?.top ?? 0, 0);
  const bottom = Math.min(box.bottom, frame?.bottom ?? window.innerHeight, window.innerHeight);
  const left = Math.max(box.left, frame?.left ?? 0, 0);
  const right = Math.min(box.right, frame?.right ?? window.innerWidth, window.innerWidth);
  if (bottom <= top || right <= left) return { x: 50, y: 50 };
  return {
    x: round(clamp((((left + right) / 2 - box.left) / box.width) * 100)),
    y: round(clamp((((top + bottom) / 2 - box.top) / box.height) * 100)),
  };
}

/**
 * Transparent click catcher over the preview in comment mode. Keyboard users
 * focus it, move a crosshair with the arrow keys and press Enter to drop a pin.
 */
export function CommentOverlay({ onPlace, onExit, ref }: CommentOverlayProps) {
  const [cursor, setCursor] = useState<PinPoint | null>(null);
  // The crosshair is for keyboard use. It stays hidden when focus comes back from a click or a mouse-driven post.
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const helpId = useId();

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    onPlace({
      x: round(clamp(((event.clientX - box.left) / box.width) * 100)),
      y: round(clamp(((event.clientY - box.top) / box.height) * 100)),
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    setKeyboardFocus(true);
    const step = event.shiftKey ? BIG_STEP : STEP;
    const current = cursor ?? visibleCentre(event.currentTarget);
    const moves: Record<string, PinPoint> = {
      ArrowLeft: { x: current.x - step, y: current.y },
      ArrowRight: { x: current.x + step, y: current.y },
      ArrowUp: { x: current.x, y: current.y - step },
      ArrowDown: { x: current.x, y: current.y + step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCursor({ x: clamp(move.x), y: clamp(move.y) });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPlace(current);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onExit();
    }
  };

  return (
    <div
      ref={ref}
      role="application"
      tabIndex={0}
      aria-label="Comment canvas"
      aria-describedby={helpId}
      data-testid="comment-overlay"
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const node = event.currentTarget;
        setCursor((value) => value ?? visibleCentre(node));
        setKeyboardFocus(lastInputWasKeyboard());
      }}
      onBlur={() => {
        setCursor(null);
        setKeyboardFocus(false);
      }}
      className="absolute inset-0 z-[5] cursor-crosshair focus-visible:outline-none"
    >
      <span id={helpId} className="sr-only">
        Click or tap anywhere to add a comment. With a keyboard, use the arrow keys to move the
        crosshair (hold Shift for bigger steps), press Enter to place a pin, and press Escape to
        leave Comment mode.
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-brand/60 ring-inset"
      />
      {cursor && keyboardFocus ? (
        <span
          aria-hidden="true"
          data-testid="crosshair"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          // The white halo keeps the crosshair visible on dark and cobalt content too.
          className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-pin-focus bg-brand-soft ring-2 ring-pin-halo"
        >
          <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-pin-focus ring-2 ring-pin-halo" />
        </span>
      ) : null}
    </div>
  );
}
