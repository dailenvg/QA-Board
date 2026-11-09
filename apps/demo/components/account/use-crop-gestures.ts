import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  panBy,
  stopAtFill,
  zoomTo,
  type Framing,
  type SourceSize,
  type ZoomRange,
} from "@/lib/account/image-framing";

export type FramingChange = (change: (framing: Framing) => Framing) => void;

interface CropGestureOptions {
  size: SourceSize;
  range: ZoomRange;
  onChange: FramingChange;
}

interface Point {
  x: number;
  y: number;
}

/** How far an arrow key moves the image, in frame sides; with Shift, the larger step. */
const KEY_STEP = 0.02;
const KEY_STEP_LARGE = 0.1;

/** How much one pixel of wheel scroll zooms (a notch is about 100 px): out for down, in for up. */
const WHEEL_ZOOM = 0.0015;

/** A wheel's delta in pixels, whatever unit it came in (Firefox can send lines). */
function wheelPixels(event: WheelEvent): number {
  return event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
}

/**
 * Whether something around `element` (the dialog, on a short screen) has
 * content to scroll vertically. While it does, the wheel scrolls it rather
 * than zooming, so the frame never traps the wheel above a Save button out of view.
 */
function inScrollingParent(element: HTMLElement): boolean {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return true;
  }
  return false;
}

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Moving and zooming the crop frame's image: one pointer (mouse, pen or
 * touch) drags it 1:1, two pinch it, the wheel zooms it (unless the dialog
 * around it has more to scroll to; a trackpad pinch still zooms), and arrow keys move
 * it. Pointers are captured, so a drag that leaves the frame keeps going.
 * Spread `handlers` on the frame and give it `ref` (the wheel needs a
 * listener that can cancel scrolling, which React's can't).
 */
export function useCropGestures({ size, range, onChange }: CropGestureOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const latest = useRef({ size, range, onChange });
  useEffect(() => {
    latest.current = { size, range, onChange };
  });

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      // A trackpad pinch arrives as a wheel with Ctrl held: that always zooms.
      if (!event.ctrlKey && inScrollingParent(frame)) return;
      event.preventDefault();
      const { size, range, onChange } = latest.current;
      const factor = Math.exp(-wheelPixels(event) * WHEEL_ZOOM);
      onChange((framing) =>
        zoomTo(size, range, framing, stopAtFill(range, framing.scale, framing.scale * factor)),
      );
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = pointers.current;
    const last = active.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    const other = [...active].find(([id]) => id !== event.pointerId)?.[1];
    active.set(event.pointerId, point);
    if (other) {
      const ratio = distance(point, other) / Math.max(1, distance(last, other));
      onChange((framing) =>
        zoomTo(size, range, framing, stopAtFill(range, framing.scale, framing.scale * ratio)),
      );
      return;
    }
    const side = event.currentTarget.getBoundingClientRect().width;
    if (side > 0) {
      onChange((framing) =>
        panBy(size, framing, (point.x - last.x) / side, (point.y - last.y) / side),
      );
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const arrow = ARROWS[event.key];
    if (!arrow || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    onChange((framing) => panBy(size, framing, arrow.x * step, arrow.y * step));
  };

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: onPointerEnd,
      onKeyDown,
    },
  };
}
