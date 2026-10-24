"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent, type Ref } from "react";
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
 * Transparent click catcher over the preview in comment mode. Keyboard users
 * focus it, move a crosshair with the arrow keys and press Enter to drop a pin.
 */
export function CommentOverlay({ onPlace, onExit, ref }: CommentOverlayProps) {
  const [cursor, setCursor] = useState<PinPoint | null>(null);
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
    const step = event.shiftKey ? BIG_STEP : STEP;
    const current = cursor ?? { x: 50, y: 50 };
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
      onFocus={() => setCursor((value) => value ?? { x: 50, y: 50 })}
      onBlur={() => setCursor(null)}
      className="group/overlay absolute inset-0 z-[5] cursor-crosshair focus-visible:outline-none"
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
      {cursor ? (
        <span
          aria-hidden="true"
          data-testid="crosshair"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
          // The white halo keeps the crosshair visible on dark and cobalt content too.
          className="pointer-events-none absolute hidden size-8 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-pin-focus bg-brand-soft ring-2 ring-pin-halo group-focus-visible/overlay:block"
        >
          <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-pin-focus ring-2 ring-pin-halo" />
        </span>
      ) : null}
    </div>
  );
}
